import { ConflictError } from "./conflict.error.js";
import { NotFoundError } from "./not-found.error.js";
import { DesignationErrorCode } from "../data/constants/designation-error.constant.js";
import type { OrganisationalUnitType } from "../data/constants/organisational-unit.constant.js";

export function designationNotFound(id: string): NotFoundError {
  return new NotFoundError(`Designation '${id}' not found`, { code: DesignationErrorCode.DESIGNATION_NOT_FOUND });
}

export function designationCodeTaken(code: string): ConflictError {
  return new ConflictError(`A designation with code '${code}' already exists`, {
    code: DesignationErrorCode.DESIGNATION_CODE_TAKEN,
    details: { field: "code" },
  });
}

export function designationTitleTaken(title: string): ConflictError {
  return new ConflictError(`A designation titled '${title}' already exists`, {
    code: DesignationErrorCode.DESIGNATION_TITLE_TAKEN,
    details: { field: "title" },
  });
}

export function designationUnitTypeInUse(unitType: OrganisationalUnitType, holderCount: number): ConflictError {
  return new ConflictError(`${holderCount} holder(s) hold this designation in a ${unitType}`, {
    code: DesignationErrorCode.DESIGNATION_UNIT_TYPE_IN_USE,
    details: { unit_type: unitType, holder_count: holderCount },
  });
}

export function designationSingleHolderViolated(organisationalUnitIds: readonly string[]): ConflictError {
  return new ConflictError("Some organisational units already have more than one holder of this designation", {
    code: DesignationErrorCode.DESIGNATION_SINGLE_HOLDER_VIOLATED,
    details: { organisational_unit_ids: [...organisationalUnitIds] },
  });
}

export function designationInUse(holderCount: number): ConflictError {
  return new ConflictError("The designation has holders; archive it instead", {
    code: DesignationErrorCode.DESIGNATION_IN_USE,
    details: { holder_count: holderCount },
  });
}
