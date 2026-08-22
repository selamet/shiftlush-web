import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { components } from "@/api/generated";
import { api, onSessionExpired, setAccessToken } from "@/api/client";
import type { Role } from "@/components/layout/nav-config";

type CurrentUser = components["schemas"]["CurrentUser"];
type TokenResponse = components["schemas"]["TokenResponse"];

export type SessionStatus = "restoring" | "authenticated" | "anonymous";

export interface Session {
  status: SessionStatus;
  role: Role | null;
  fullName: string | null;
  companyName: string | null;
}

interface SessionContextValue extends Session {
  signIn: (email: string, password: string) => Promise<void>;
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
export interface SessionOverride {
  role: Role;
  fullName: string;
  companyName: string;
}

function toSession(user: CurrentUser): Omit<Session, "status"> {
  return {
    role: user.role as Role,
    fullName: user.full_name,
    // Comes back with the session rather than from a second request: the
    // topbar shows it on every screen, and a separate call on the boot path
    // leaves that space empty while it is in flight.
    companyName: user.company_name,
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
  const [status, setStatus] = useState<SessionStatus>(override ? "authenticated" : "restoring");
  const [user, setUser] = useState<Omit<Session, "status"> | null>(override ?? null);

  useEffect(() => {
    if (override) return;

    let cancelled = false;

    // The refresh cookie is httpOnly, so there is no way to know whether a
    // session exists without asking. An anonymous visitor lands here too and
    // gets a 401, which is the expected answer rather than an error.
    void (async () => {
      try {
        const tokens = await api.post<TokenResponse>("/auth/refresh", undefined, {
          anonymous: true,
        });
        if (cancelled) return;
        setAccessToken(tokens.access);
        setUser(toSession(tokens.user));
        setStatus("authenticated");
      } catch {
        if (cancelled) return;
        setAccessToken(null);
        setStatus("anonymous");
      }
    })();

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
    });
  }, []);

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
    }
  }, []);

  const setRole = useCallback((role: Role) => {
    setUser((current) => (current ? { ...current, role } : current));
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      role: status === "authenticated" ? (user?.role ?? null) : null,
      fullName: status === "authenticated" ? (user?.fullName ?? null) : null,
      companyName: status === "authenticated" ? (user?.companyName ?? null) : null,
      signIn,
      signOut,
      setRole,
    }),
    [status, user, signIn, signOut, setRole],
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
