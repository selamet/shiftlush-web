import { createContext, useContext, useEffect, useMemo, useState } from "react";
import demoSession from "@fixtures/demo-session.json";
import type { Role } from "@/components/layout/nav-config";

export type SessionStatus = "restoring" | "authenticated" | "anonymous";

export interface Session {
  status: SessionStatus;
  role: Role | null;
  fullName: string | null;
  companyName: string | null;
}

interface SessionContextValue extends Session {
  /** Dev affordance: lets the styleguide walk through each role's sidebar. */
  setRole: (role: Role) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const RESTORE_DELAY_MS = 300;

/**
 * The access token is held in memory only (never in browser storage), so every
 * full page load starts with no session and has to call the refresh endpoint
 * before the role is known. That gap is a real, visible state — see BootSkeleton
 * for what the shell renders during it.
 *
 * The delay is simulated here; this is replaced by the real `/auth/refresh`
 * call once the API layer lands.
 */
export function SessionProvider({
  children,
  initialRole = "operations",
}: {
  children: React.ReactNode;
  initialRole?: Role;
}) {
  const [status, setStatus] = useState<SessionStatus>("restoring");
  const [role, setRole] = useState<Role>(initialRole);

  useEffect(() => {
    const timer = setTimeout(() => setStatus("authenticated"), RESTORE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      role: status === "authenticated" ? role : null,
      fullName: status === "authenticated" ? demoSession.fullName : null,
      companyName: status === "authenticated" ? demoSession.companyName : null,
      setRole,
    }),
    [status, role],
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
