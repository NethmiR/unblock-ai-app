import { ConflictError } from "./conflict.error.js";
import { NotFoundError } from "./not-found.error.js";
import { ValidationError } from "./validation.error.js";
import { OrganisationalUnitErrorCode } from "../data/constants/organisational-unit-error.constant.js";
import type { OrganisationalUnitUsage } from "../lib/types/organisational-unit/organisational-unit.type.js";

export function organisationalUnitNotFound(id: string): NotFoundError {
  return new NotFoundError(`Organisational unit '${id}' not found`, {
    code: OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_NOT_FOUND,
  });
}

export function organisationalUnitCodeTaken(code: string): ConflictError {
  return new ConflictError(`An organisational unit with code '${code}' already exists`, {
    code: OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_CODE_TAKEN,
    details: { field: "code" },
  });
}

export function organisationalUnitNameTaken(name: string): ConflictError {
  return new ConflictError(`An organisational unit named '${name}' already exists at this level`, {
    code: OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_NAME_TAKEN,
    details: { field: "name" },
  });
}

export function organisationalUnitParentInvalid(message: string): ValidationError {
  return new ValidationError(message, {
    code: OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_PARENT_INVALID,
    details: { field: "parent_id" },
  });
}

export function organisationalUnitParentArchived(parentName: string): ConflictError {
  return new ConflictError(`'${parentName}' is archived; restore it first`, {
    code: OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_PARENT_ARCHIVED,
    details: { field: "parent_id" },
  });
}

export function organisationalUnitHasActiveChildren(activeChildCount: number): ConflictError {
  return new ConflictError(`Archive its ${activeChildCount} active child unit(s) first`, {
    code: OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_HAS_ACTIVE_CHILDREN,
    details: { active_child_count: activeChildCount },
  });
}

export function organisationalUnitInUse(usage: Pick<OrganisationalUnitUsage, "memberCount" | "childCount">): ConflictError {
  return new ConflictError("The organisational unit has members or child units; archive it instead", {
    code: OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_IN_USE,
    details: { member_count: usage.memberCount, child_count: usage.childCount },
  });
}

export function departmentWithMembersCannotMove(memberCount: number): ConflictError {
  return new ConflictError(
    `The department has ${memberCount} member(s), who must also belong to its faculty; remove them before moving it to another faculty`,
    {
      code: OrganisationalUnitErrorCode.ORGANISATIONAL_UNIT_HAS_MEMBERS,
      details: { field: "parent_id", member_count: memberCount },
    },
  );
}
