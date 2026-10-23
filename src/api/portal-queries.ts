/**
 * The portal's queries and actions, through the portal client only.
 *
 * Every key starts with `"portal"`. The portal and the staff app share one
 * query client, and a staff key and a portal key that happened to coincide —
 * `["elevators", "detail", id]` from either side — would hand one principal's
 * answer to the other. The prefix also makes signing out of the portal one
 * removal that leaves anything else alone.
 */
import { queryOptions } from "@tanstack/react-query";
import type { components } from "@/api/generated";
import type { ListParams, Paginated } from "@/api/queries";
import { portal } from "@/api/portal-client";

type Schemas = components["schemas"];

export type PortalMe = Schemas["PortalMe"];
export type PortalTokenResponse = Schemas["PortalTokenResponse"];
export type PortalElevator = Schemas["PortalElevator"];
export type PortalVisit = Schemas["PortalVisit"];
export type PortalInspection = Schemas["PortalInspection"];
export type PortalFault = Schemas["PortalFault"];
export type PortalFaultReport = Schemas["PortalFaultReportRequest"];
export type PortalReport = Schemas["PortalReport"];

/** A file a visit carries, as the portal describes it: enough to name it and fetch it. */
export interface PortalFile {
  id: string;
  original_filename: string;
  mime_type: string;
  category: string;
}

export const portalKeys = {
  all: ["portal"] as const,
  me: ["portal", "me"] as const,
  elevators: ["portal", "elevators"] as const,
  elevator: (id: string) => ["portal", "elevators", id] as const,
  visits: (params: ListParams) => ["portal", "visits", params] as const,
  inspections: (params: ListParams) => ["portal", "inspections", params] as const,
  faults: (params: ListParams) => ["portal", "faults", params] as const,
  reports: ["portal", "reports"] as const,
} as const;

/** A customer's lifts fit in one page; a building manager is not paging through a fleet. */
const ALL = { page_size: 100 };

export function portalMeQuery() {
  return queryOptions({
    queryKey: portalKeys.me,
    queryFn: ({ signal }) => portal.api.get<PortalMe>("/portal/me", { signal }),
  });
}

export function portalElevatorsQuery() {
  return queryOptions({
    queryKey: portalKeys.elevators,
    queryFn: ({ signal }) =>
      portal.api.get<Paginated<PortalElevator>>("/portal/elevators/", { query: ALL, signal }),
  });
}

export function portalElevatorQuery(id: string) {
  return queryOptions({
    queryKey: portalKeys.elevator(id),
    queryFn: ({ signal }) => portal.api.get<PortalElevator>(`/portal/elevators/${id}/`, { signal }),
  });
}

export function portalVisitsQuery(params: ListParams) {
  return queryOptions({
    queryKey: portalKeys.visits(params),
    queryFn: ({ signal }) =>
      portal.api.get<Paginated<PortalVisit>>("/portal/visits/", { query: params, signal }),
  });
}

export function portalInspectionsQuery(params: ListParams) {
  return queryOptions({
    queryKey: portalKeys.inspections(params),
    queryFn: ({ signal }) =>
      portal.api.get<Paginated<PortalInspection>>("/portal/inspections/", { query: params, signal }),
  });
}

export function portalFaultsQuery(params: ListParams = ALL) {
  return queryOptions({
    queryKey: portalKeys.faults(params),
    queryFn: ({ signal }) =>
      portal.api.get<Paginated<PortalFault>>("/portal/faults/", { query: params, signal }),
  });
}

/**
 * The customer's monthly reports, newest first. A few a year, so one page;
 * the PDF downloads through the portal's files endpoint like any other file.
 */
export function portalReportsQuery() {
  return queryOptions({
    queryKey: portalKeys.reports,
    queryFn: ({ signal }) =>
      portal.api.get<Paginated<PortalReport>>("/portal/reports/", { query: ALL, signal }),
  });
}

export function portalLogin(email: string, password: string) {
  return portal.api.post<PortalTokenResponse>("/portal/auth/login", { email, password }, { anonymous: true });
}

export function portalAccept(token: string, password: string) {
  return portal.api.post<PortalTokenResponse>("/portal/auth/accept", { token, password }, { anonymous: true });
}

/** Ends this session on the server and clears the portal refresh cookie. */
export function portalLogout() {
  return portal.api.post<void>("/portal/auth/logout", undefined, { anonymous: true });
}

export function portalRequestPasswordReset(email: string) {
  return portal.api.post<void>("/portal/auth/password-reset", { email }, { anonymous: true });
}

export function portalConfirmPasswordReset(token: string, password: string) {
  return portal.api.post<void>("/portal/auth/password-reset/confirm", { token, password }, { anonymous: true });
}

/**
 * A fault from the building manager. Carries an Idempotency-Key: a manager on
 * a poor connection who presses again must not report the same fault twice.
 */
export function portalReportFault(body: PortalFaultReport, idempotencyKey: string) {
  return portal.api.post<PortalFault>("/portal/faults/", body, { idempotencyKey });
}

/** A URL that works for a few minutes, asked for at the moment of the click. */
export function portalFileUrl(id: string) {
  return portal.api.get<Schemas["DownloadUrl"]>(`/portal/files/${id}/download-url/`);
}
