import { requireObjectArray, requireUuidArray, requireUuidField } from "./request-validator.util.js";
import type { ReplaceUserAffiliationsInput } from "../../lib/types/user-affiliation/user-affiliation.type.js";

const MEMBERSHIPS_FIELD = "memberships";
const ORGANISATIONAL_UNIT_ID_FIELD = "organisational_unit_id";
const DESIGNATION_IDS_FIELD = "designation_ids";

export function parseReplaceUserAffiliationsBody(body: unknown): ReplaceUserAffiliationsInput {
  return {
    memberships: requireObjectArray(body, MEMBERSHIPS_FIELD).map((entry, index) => ({
      organisationalUnitId: requireUuidField(entry, ORGANISATIONAL_UNIT_ID_FIELD, `${MEMBERSHIPS_FIELD}[${index}].${ORGANISATIONAL_UNIT_ID_FIELD}`),
      designationIds: requireUuidArray(entry, DESIGNATION_IDS_FIELD, `${MEMBERSHIPS_FIELD}[${index}].${DESIGNATION_IDS_FIELD}`),
    })),
  };
}
