import { apiRequest } from "./client";
import { withQuery } from "./query-string";
import type {
  CreateOrganisationalUnitRequest,
  OrganisationalUnitListQuery,
  OrganisationalUnitListResponse,
  OrganisationalUnitMemberListResponse,
  OrganisationalUnitResponse,
  UpdateOrganisationalUnitRequest,
} from "@/types/organisational-unit";

export const ORGANISATIONAL_UNITS_PATH = "/organisational-units";

export function organisationalUnitListPath(query: OrganisationalUnitListQuery = {}): string {
  return withQuery(ORGANISATIONAL_UNITS_PATH, query);
}

export function organisationalUnitPath(unitId: string): string {
  return `${ORGANISATIONAL_UNITS_PATH}/${encodeURIComponent(unitId)}`;
}

export function organisationalUnitMembersPath(unitId: string): string {
  return `${organisationalUnitPath(unitId)}/members`;
}

export const organisationalUnitsApi = {
  list: (query: OrganisationalUnitListQuery = {}) =>
    apiRequest<OrganisationalUnitListResponse>(organisationalUnitListPath(query)),

  create: (body: CreateOrganisationalUnitRequest) =>
    apiRequest<OrganisationalUnitResponse>(ORGANISATIONAL_UNITS_PATH, { method: "POST", body }),

  update: (unitId: string, body: UpdateOrganisationalUnitRequest) =>
    apiRequest<OrganisationalUnitResponse>(organisationalUnitPath(unitId), { method: "PATCH", body }),

  archive: (unitId: string) =>
    apiRequest<OrganisationalUnitResponse>(`${organisationalUnitPath(unitId)}/archive`, { method: "POST" }),

  restore: (unitId: string) =>
    apiRequest<OrganisationalUnitResponse>(`${organisationalUnitPath(unitId)}/restore`, { method: "POST" }),

  remove: (unitId: string) => apiRequest<void>(organisationalUnitPath(unitId), { method: "DELETE" }),

  members: (unitId: string) => apiRequest<OrganisationalUnitMemberListResponse>(organisationalUnitMembersPath(unitId)),
};
