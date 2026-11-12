import { apiErrorCode, apiErrorMessage } from "@/lib/api/api-error";
import { DesignationErrorCode } from "@/types/designation";
import { OrganisationalUnitErrorCode } from "@/types/organisational-unit";

const ORGANISATION_ERROR_MESSAGES: Record<OrganisationalUnitErrorCode | DesignationErrorCode, string> = {
  [OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_NOT_FOUND]: "This unit no longer exists. Refresh to see the latest structure.",
  [OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_CODE_TAKEN]: "Another unit already uses this code.",
  [OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_NAME_TAKEN]: "A unit with this name already exists at this level.",
  [OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_PARENT_INVALID]: "Choose a valid parent faculty.",
  [OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_PARENT_ARCHIVED]: "The parent faculty is archived. Restore it first.",
  [OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_HAS_ACTIVE_CHILDREN]: "Archive the units inside it first.",
  [OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_IN_USE]: "This unit still has members or child units. Archive it instead.",
  [OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_HAS_MEMBERS]:
    "This department has members, who must also belong to its faculty. Remove them before moving it to another faculty.",
  [DesignationErrorCode.DESIGNATION_NOT_FOUND]: "This designation no longer exists. Refresh to see the latest list.",
  [DesignationErrorCode.DESIGNATION_CODE_TAKEN]: "Another designation already uses this code.",
  [DesignationErrorCode.DESIGNATION_TITLE_TAKEN]: "Another designation already uses this title.",
  [DesignationErrorCode.DESIGNATION_UNIT_TYPE_IN_USE]: "People hold this designation in a unit type you are removing.",
  [DesignationErrorCode.DESIGNATION_SINGLE_HOLDER_VIOLATED]:
    "Some units already have more than one holder, so this cannot be limited to one holder yet.",
  [DesignationErrorCode.DESIGNATION_IN_USE]: "People still hold this designation. Archive it instead.",
};

function isOrganisationErrorCode(code: string): code is OrganisationalUnitErrorCode | DesignationErrorCode {
  return code in ORGANISATION_ERROR_MESSAGES;
}

export function describeOrganisationError(err: unknown, fallback: string): string {
  const code = apiErrorCode(err);
  return code !== null && isOrganisationErrorCode(code) ? ORGANISATION_ERROR_MESSAGES[code] : apiErrorMessage(err, fallback);
}
