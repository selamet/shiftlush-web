/**
 * Who is signed in to the customer portal, kept apart from the staff session.
 *
 * Its own provider, its own cached restore, its own token holder (in
 * portal-client.ts). None of it reads or writes the staff session: a member of
 * the firm who opens /portal is not signed in to it, and sees its login. The
 * root route mounts this provider instead of the staff one under /portal, so
 * a portal page does not even ask whether there is a staff session.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  onPortalSessionExpired,
  refreshPortalSession,
  setPortalAccessToken,
} from "@/api/portal-client";
import {
  portalKeys,
  portalLogin,
  portalLogout,
  type PortalMe,
  type PortalTokenResponse,
} from "@/api/portal-queries";

export type PortalStatus = "restoring" | "authenticated" | "anonymous";

interface PortalSessionValue {
  status: PortalStatus;
  me: PortalMe | null;
  signIn: (email: string, password: string) => Promise<void>;
  /** Takes over tokens an endpoint handed back — accepting an invitation signs the person in. */
  adoptTokens: (tokens: PortalTokenResponse) => void;
  signOut: () => Promise<void>;
}

const PortalSessionContext = createContext<PortalSessionValue | null>(null);

/**
 * Restoring the portal session, once per page load.
 *
 * A promise the router guard can await, cached so the guard and the provider
 * ask once between them — the same arrangement as the staff `ensureSession`,
 * and deliberately not the same promise.
 */
let restoring: Promise<PortalMe | null> | null = null;

export function ensurePortalSession(): Promise<PortalMe | null> {
  restoring ??= refreshPortalSession().then((tokens) => tokens?.account ?? null);
  return restoring;
}

/** The cached answer is wrong after a sign-in or out; the next guard asks again. */
export function forgetPortalSession(): void {
  restoring = null;
}

/**
 * Set only by the render check, to draw the portal signed in (a demo account)
 * or signed out, without a server. `undefined` in the running application.
 */
export type PortalSessionOverride = { me: PortalMe } | "anonymous";

export function PortalSessionProvider({
  children,
  override,
}: {
  children: React.ReactNode;
  override?: PortalSessionOverride;
}) {
  const queryClient = useQueryClient();
  const initialMe = override && override !== "anonymous" ? override.me : null;
  const [me, setMe] = useState<PortalMe | null>(initialMe);
  const [status, setStatus] = useState<PortalStatus>(
    override ? (override === "anonymous" ? "anonymous" : "authenticated") : "restoring",
  );

  useEffect(() => {
    if (override) return;
    let cancelled = false;
    void ensurePortalSession().then((account) => {
      if (cancelled) return;
      setMe(account);
      setStatus(account ? "authenticated" : "anonymous");
    });
    return () => {
      cancelled = true;
    };
  }, [override]);

  useEffect(() => {
    // A refresh that fails mid-session: the portal session is over whether or
    // not anybody is looking. Back to the portal's own login — never the
    // staff one, which this person has no account for.
    onPortalSessionExpired(() => {
      setPortalAccessToken(null);
      setMe(null);
      setStatus("anonymous");
      forgetPortalSession();
      queryClient.removeQueries({ queryKey: portalKeys.all });
      if (!window.location.pathname.startsWith("/portal/login")) {
        window.location.assign("/portal/login");
      }
    });
    return () => onPortalSessionExpired(null);
  }, [queryClient]);

  const adoptTokens = useCallback((tokens: PortalTokenResponse) => {
    setPortalAccessToken(tokens.access);
    setMe(tokens.account);
    setStatus("authenticated");
    forgetPortalSession();
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      adoptTokens(await portalLogin(email, password));
    },
    [adoptTokens],
  );

  const signOut = useCallback(async () => {
    try {
      await portalLogout();
    } finally {
      // Whatever the server said: this device is signed out either way, and
      // nothing the portal fetched stays in the cache for the next person.
      setPortalAccessToken(null);
      setMe(null);
      setStatus("anonymous");
      forgetPortalSession();
      queryClient.removeQueries({ queryKey: portalKeys.all });
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({ status, me, signIn, adoptTokens, signOut }),
    [status, me, signIn, adoptTokens, signOut],
  );

  return <PortalSessionContext.Provider value={value}>{children}</PortalSessionContext.Provider>;
}

export function usePortalSession(): PortalSessionValue {
  const value = useContext(PortalSessionContext);
  if (!value) throw new Error("usePortalSession must be used inside PortalSessionProvider");
  return value;
}
