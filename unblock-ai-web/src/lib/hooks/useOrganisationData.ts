"use client";
import useSWR, { type SWRResponse } from "swr";
import { fetcher } from "@/lib/api/client";
import { designationListPath } from "@/lib/api/designations";
import { organisationalUnitListPath, organisationalUnitMembersPath } from "@/lib/api/organisational-units";
import type { DesignationListResponse } from "@/types/designation";
import type {
  OrganisationalUnitListQuery,
  OrganisationalUnitListResponse,
  OrganisationalUnitMemberListResponse,
} from "@/types/organisational-unit";

export function useOrganisationalUnits(
  query: OrganisationalUnitListQuery = {},
): SWRResponse<OrganisationalUnitListResponse, unknown> {
  return useSWR<OrganisationalUnitListResponse>(organisationalUnitListPath(query), fetcher);
}

export function useDesignations(includeArchived: boolean): SWRResponse<DesignationListResponse, unknown> {
  return useSWR<DesignationListResponse>(designationListPath(includeArchived), fetcher);
}

export function useOrganisationalUnitMembers(unitId: string | null): SWRResponse<OrganisationalUnitMemberListResponse, unknown> {
  return useSWR<OrganisationalUnitMemberListResponse>(unitId === null ? null : organisationalUnitMembersPath(unitId), fetcher);
}
