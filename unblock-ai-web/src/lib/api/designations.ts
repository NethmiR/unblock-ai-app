import { apiRequest } from "./client";
import { withQuery } from "./query-string";
import type {
  CreateDesignationRequest,
  DesignationListResponse,
  DesignationResponse,
  UpdateDesignationRequest,
} from "@/types/designation";

export const DESIGNATIONS_PATH = "/designations";

export function designationListPath(includeArchived: boolean): string {
  return withQuery(DESIGNATIONS_PATH, { include_archived: includeArchived });
}

function designationPath(designationId: string): string {
  return `${DESIGNATIONS_PATH}/${encodeURIComponent(designationId)}`;
}

export const designationsApi = {
  list: (includeArchived: boolean) => apiRequest<DesignationListResponse>(designationListPath(includeArchived)),

  create: (body: CreateDesignationRequest) =>
    apiRequest<DesignationResponse>(DESIGNATIONS_PATH, { method: "POST", body }),

  update: (designationId: string, body: UpdateDesignationRequest) =>
    apiRequest<DesignationResponse>(designationPath(designationId), { method: "PATCH", body }),

  archive: (designationId: string) =>
    apiRequest<DesignationResponse>(`${designationPath(designationId)}/archive`, { method: "POST" }),

  restore: (designationId: string) =>
    apiRequest<DesignationResponse>(`${designationPath(designationId)}/restore`, { method: "POST" }),

  remove: (designationId: string) => apiRequest<void>(designationPath(designationId), { method: "DELETE" }),
};
