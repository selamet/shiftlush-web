import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { components } from "@/api/generated";
import { api, onSessionExpired, setAccessToken } from "@/api/client";
import type { Role } from "@/components/layout/nav-config";

type CurrentUser = components["schemas"]["CurrentUser"];
type TokenResponse = components["schemas"]["TokenResponse"];

export type SessionStatus = "restoring" | "authenticated" | "anonymous";

export interface Session {
  status: SessionStatus;
  /** Who you are, so a screen can tell your own record from a colleague's. */
  userId: string | null;
  role: Role | null;
  fullName: string | null;
  companyName: string | null;
  /** False until the address is confirmed. Gates inviting colleagues, nothing else. */
  emailVerified: boolean;
}

interface SessionContextValue extends Session {
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Takes over the tokens an endpoint handed back mid-session.
   *
   * One endpoint does this: changing the password. It ends every session on the
   * account — including, on the server, the row behind the refresh token this
   * tab is holding — and re-opens the caller's on the same chain with a new
   * refresh cookie and a new access token, returned as the `TokenResponse` that
   * signing in returns.
   *
   * The cookie swaps itself; the access token does not. A client that ignores
   * the response keeps a token that is merely surviving on its own expiry, and
   * the moment it runs out the refresh behind it is gone too — so a successful
   * password change would sign the user out, several minutes later, for no
   * reason they could connect to what they did. Adopting is the whole fix.
   */
  adoptTokens: (tokens: TokenResponse) => void;
  /** Called after the address is confirmed, so the banner goes without a reload. */
  markVerified: () => void;
  signOut: () => Promise<void>;
  /** Styleguide affordance: walks through each role's sidebar. Never the real role. */
  setRole: (role: Role) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * A session without a server, for the styleguide and the render smoke test.
 *
 * Rendering the shell for a given role has nothing to do with authentication,
 * and making those two paths need a running backend would mean the smoke test
 * proves less, not more.
 */
/**
 * Restoring the session, once per page load.
 *
 * A promise rather than React state, because the router has to be able to await
 * it: the guard must decide before the loaders run, and a component-level
 * redirect fires too late — the loader has already made the request that a
 * signed-out visitor should never have made.
 *
 * Cached, so several consumers asking at once produce one call to
 * /auth/refresh rather than one each.
 */
let restoring: Promise<CurrentUser | null> | null = null;

export function ensureSession(): Promise<CurrentUser | null> {
  restoring ??= (async () => {
    try {
      // The refresh cookie is httpOnly, so the only way to find out whether a
      // session exists is to ask. An anonymous visitor gets a 401 here, which
      // is the expected answer rather than an error.
      const tokens = await api.post<TokenResponse>("/auth/refresh", undefined, {
        anonymous: true,
      });
      setAccessToken(tokens.access);
      return tokens.user;
    } catch {
      setAccessToken(null);
      return null;
    }
  })();
  return restoring;
}

/** Called after signing in or out, so the next guard asks again. */
export function forgetSession(): void {
  restoring = null;
}

export interface SessionOverride {
  userId?: string;
  role: Role;
  fullName: string;
  companyName: string;
  emailVerified?: boolean;
}

function toSession(user: CurrentUser): Omit<Session, "status"> {
  return {
    userId: user.id,
    role: user.role as Role,
    fullName: user.full_name,
    // Comes back with the session rather than from a second request: the
    // topbar shows it on every screen, and a separate call on the boot path
    // leaves that space empty while it is in flight.
    companyName: user.company_name,
    emailVerified: user.is_email_verified,
  };
}

/**
 * The access token lives in memory only — never in browser storage — so every
 * full page load starts with no session and has to call `/auth/refresh` before
 * the role is known. That gap is a real, visible state; see AppShell for what
 * the shell renders during it.
 */
export function SessionProvider({
  children,
  override,
}: {
  children: React.ReactNode;
  override?: SessionOverride;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SessionStatus>(override ? "authenticated" : "restoring");
  const [user, setUser] = useState<Omit<Session, "status"> | null>(
    override
      ? {
          ...override,
          userId: override.userId ?? null,
          emailVerified: override.emailVerified ?? true,
        }
      : null,
  );

  useEffect(() => {
    if (override) return;

    let cancelled = false;
    // The same promise the router guard awaited, so this does not make a second
    // call to find out what has already been established.
    void ensureSession().then((current) => {
      if (cancelled) return;
      setUser(current ? toSession(current) : null);
      setStatus(current ? "authenticated" : "anonymous");
    });

    return () => {
      cancelled = true;
    };
  }, [override]);

  useEffect(() => {
    // Fires when a refresh fails mid-session: the token expired and could not
    // be renewed, so the session is over whether or not the user is looking.
    onSessionExpired(() => {
      setAccessToken(null);
      setUser(null);
      setStatus("anonymous");
      forgetSession();
      queryClient.clear();
      // Navigated rather than left in place. A shell whose every request fails
      // is not a state anybody can act on, and it looks identical to an outage.
      if (!window.location.pathname.startsWith("/login")) {
        window.location.assign("/login");
      }
    });
  }, [queryClient]);

  const signIn = useCallback(async (email: string, password: string) => {
    // Deliberately not wrapped in try/catch: the login screen shows the error,
    // and swallowing it here would leave the form looking like nothing happened.
    const tokens = await api.post<TokenResponse>(
      "/auth/login",
      { email, password },
      { anonymous: true },
    );
    setAccessToken(tokens.access);
    setUser(toSession(tokens.user));
    setStatus("authenticated");
    // The cached answer is now wrong; the next guard has to ask again.
    forgetSession();
  }, []);

  const adoptTokens = useCallback((tokens: TokenResponse) => {
    setAccessToken(tokens.access);
    // The same user, re-read from the response rather than left alone: it is
    // the shape sign-in returns and nothing here should be deciding which
    // half of it is worth keeping.
    setUser(toSession(tokens.user));
    setStatus("authenticated");
    // The cached restore resolved against the tokens that have just been
    // retired. Left in place, the next guard would answer from it — and it is
    // an answer about a session that no longer exists.
    forgetSession();
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      // In `finally` because a failed logout call must still end the session
      // locally. Leaving someone signed in because the server did not answer
      // is the wrong way round.
      setAccessToken(null);
      setUser(null);
      setStatus("anonymous");
      forgetSession();
      // Every cached answer belonged to the session that just ended. Left in
      // place, the next person to sign in on this tab is shown the previous
      // one's customers and contract totals in the first frame, before a
      // request of their own has answered — the cache outlives the session
      // otherwise, because the client is created once at module scope.
      queryClient.clear();
    }
  }, [queryClient]);

  const markVerified = useCallback(() => {
    setUser((current) => (current ? { ...current, emailVerified: true } : current));
  }, []);

  const setRole = useCallback((role: Role) => {
    setUser((current) => (current ? { ...current, role } : current));
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      userId: status === "authenticated" ? (user?.userId ?? null) : null,
      role: status === "authenticated" ? (user?.role ?? null) : null,
      fullName: status === "authenticated" ? (user?.fullName ?? null) : null,
      companyName: status === "authenticated" ? (user?.companyName ?? null) : null,
      emailVerified: user?.emailVerified ?? false,
      signIn,
      adoptTokens,
      signOut,
      markVerified,
      setRole,
    }),
    [status, user, signIn, adoptTokens, signOut, markVerified, setRole],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside a SessionProvider");
  return context;
}

export function initials(fullName: string): string {
  return fullName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase("tr-TR");
}
