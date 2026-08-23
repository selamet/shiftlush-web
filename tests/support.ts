/**
 * A fetch that answers from a script instead of from a network.
 *
 * Routed by path rather than by call order, because the thing most worth
 * asserting about this client is *how many times* it touched a given endpoint —
 * one refresh for ten concurrent requests, one retry and not two — and a single
 * ordered queue makes that count something you infer rather than something you
 * read.
 *
 * An exhausted route answers 599 and is recorded in `unexpected`. It would be
 * easier to throw, and wrong: a throw inside `sendWithAuth`'s try becomes
 * `NETWORK_ERROR`, so a test asserting NETWORK_ERROR would pass for the wrong
 * reason — the very confusion these tests exist to remove.
 */

/**
 * The error a call rejected with.
 *
 * `expect(...).rejects` can only assert on the shape of a thrown value through
 * a matcher; several cases here need to look at the value itself — its `code`,
 * its `reason`, whether it is an ApiError at all — so the value is what this
 * hands back.
 */
export async function thrown(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to reject, and it resolved");
}

export interface RecordedCall {
  url: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  credentials: string | undefined;
}

export type Step = Response | Error | ((call: RecordedCall) => Response | Promise<Response>);

export interface FakeFetch {
  calls: RecordedCall[];
  unexpected: RecordedCall[];
  callsTo(path: string): RecordedCall[];
}

/** A body in the shape the server actually sends for a failure. */
export function errorEnvelope(
  status: number,
  code: string,
  extra: { requestId?: string; details?: { field?: string; code: string }[] } = {},
): Response {
  return new Response(
    JSON.stringify({
      error: { code, request_id: extra.requestId ?? "", details: extra.details ?? [] },
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

/** A dropped connection. What fetch throws when the machine room has no signal. */
export function networkDrop(): TypeError {
  return new TypeError("Failed to fetch");
}

/** What fetch throws when the caller aborts. Not a failure to report. */
export function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function normaliseHeaders(init: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    (init.headers as Record<string, string> | undefined) ?? {},
  )) {
    headers[key.toLowerCase()] = value;
  }
  return headers;
}

/**
 * Installs a fetch answering from `routes`, keyed by the tail of the path.
 *
 * A route's steps are consumed in order. A route given a bare `Step` rather
 * than an array answers with it for every call, which is what the concurrency
 * cases need.
 */
export function installFetch(routes: Record<string, Step | Step[]>): FakeFetch {
  const calls: RecordedCall[] = [];
  const unexpected: RecordedCall[] = [];
  const queues = new Map<string, Step[]>();
  const repeated = new Map<string, Step>();

  for (const [path, step] of Object.entries(routes)) {
    if (Array.isArray(step)) queues.set(path, [...step]);
    else repeated.set(path, step);
  }

  function match(path: string): string | undefined {
    for (const key of [...queues.keys(), ...repeated.keys()]) {
      if (path.endsWith(key)) return key;
    }
    return undefined;
  }

  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const call: RecordedCall = {
      url,
      path: new URL(url).pathname,
      method: init.method ?? "GET",
      headers: normaliseHeaders(init),
      body: typeof init.body === "string" ? init.body : undefined,
      credentials: init.credentials,
    };
    calls.push(call);

    const key = match(call.path);
    const step = key === undefined ? undefined : (queues.get(key)?.shift() ?? repeated.get(key));

    if (step === undefined) {
      unexpected.push(call);
      return new Response(null, { status: 599 });
    }
    if (typeof step === "function") return await step(call);
    if (step instanceof Error) throw step;
    // Cloned so a repeated route can answer more than once: a Response body is
    // readable exactly one time.
    return step.clone();
  }) as typeof fetch;

  return {
    calls,
    unexpected,
    callsTo: (path: string) => calls.filter((call) => call.path.endsWith(path)),
  };
}
