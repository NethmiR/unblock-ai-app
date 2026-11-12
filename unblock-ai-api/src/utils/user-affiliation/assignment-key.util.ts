import type { DesignationAssignmentKey } from "../../lib/types/user-affiliation/user-affiliation.type.js";

export function toAssignmentKey({ designationId, organisationalUnitId }: DesignationAssignmentKey): string {
  return `${designationId}:${organisationalUnitId}`;
}
