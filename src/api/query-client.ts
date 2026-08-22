import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";

/**
 * Defaults are written out rather than inherited.
 *
 * Silent defaults become "why did that fire twice" a month later, and the two
 * that matter here both need a reason.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        /**
         * Retrying a 404 or a 403 wastes three round trips to reach the same
         * answer, and retrying a 401 fights the refresh cycle in the client,
         * which already retries once after renewing the token. Only genuine
         * transport failures and server faults are worth a second attempt.
         */
        retry: (failureCount, error) => {
          if (failureCount >= 2) return false;
          if (!(error instanceof ApiError)) return false;
          return error.code === "NETWORK_ERROR" || error.status >= 500;
        },
        /**
         * Thirty seconds. Long enough that moving between a list and a record
         * and back does not refetch, short enough that a colleague's edit shows
         * up without a manual reload — this is shared operational data, and two
         * people looking at the same contract must not see different numbers
         * for long.
         */
        staleTime: 30_000,
        /**
         * Off. The window regains focus every time someone alt-tabs from the
         * lift they are standing next to; refetching the whole screen each time
         * costs mobile data for a change that has usually not happened.
         */
        refetchOnWindowFocus: false,
      },
      mutations: {
        // Never automatic. A retried POST is a duplicate record unless the call
        // site opted in with an Idempotency-Key, and it is the call site that
        // knows whether it did.
        retry: false,
      },
    },
  });
}
