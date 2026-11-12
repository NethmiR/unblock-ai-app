import {
  ORGANISATIONAL_UNIT_FIELD_LIMIT,
  ORGANISATIONAL_UNIT_HIERARCHY,
  OrganisationalUnitType,
} from "../data/constants/organisational-unit.constant.js";
import { ValidationError } from "../errors/validation.error.js";
import {
  departmentWithMembersCannotMove,
  organisationalUnitHasActiveChildren,
  organisationalUnitInUse,
  organisationalUnitNotFound,
  organisationalUnitParentArchived,
  organisationalUnitParentInvalid,
} from "../errors/organisational-unit.error.js";
import {
  isValidOrganisationalUnitCode,
  normalizeOrganisationalUnitCode,
} from "../utils/organisation/organisational-unit-code.util.js";
import { canHaveParent, isAllowedParent, requiresParent } from "../utils/organisation/organisational-unit-hierarchy.util.js";
import { normalizeDisplayName, normalizeOptionalText } from "../utils/shared/text.util.js";
import {
  requireMatchingFormat,
  requireOptionalTextLength,
  requireTextLength,
} from "../utils/shared/field-validation.util.js";
import type { IOrganisationalUnitRepository } from "../repositories/organisational-unit-repository/organisational-unit-repository.interface.js";
import type {
  CreateOrganisationalUnitInput,
  OrganisationalUnitListFilter,
  OrganisationalUnitParentKey,
  OrganisationalUnitRecord,
  OrganisationalUnitSummaryRecord,
  UpdateOrganisationalUnitInput,
  UpdateOrganisationalUnitRecordInput,
} from "../lib/types/organisational-unit/organisational-unit.type.js";

export interface OrganisationalUnitServiceOptions {
  organisationalUnitRepository: IOrganisationalUnitRepository;
}

export class OrganisationalUnitService {
  private readonly organisationalUnitRepository: IOrganisationalUnitRepository;

  constructor({ organisationalUnitRepository }: OrganisationalUnitServiceOptions) {
    this.organisationalUnitRepository = organisationalUnitRepository;
  }

  async list(filter: OrganisationalUnitListFilter): Promise<OrganisationalUnitSummaryRecord[]> {
    if (filter.rootOnly && filter.parentId !== null) {
      throw new ValidationError("root_only cannot be combined with parent_id", { details: { field: "root_only" } });
    }
    return this.organisationalUnitRepository.list(filter);
  }

  async getById(id: string): Promise<OrganisationalUnitSummaryRecord> {
    const unit = await this.organisationalUnitRepository.findById(id);
    if (!unit) throw organisationalUnitNotFound(id);
    return unit;
  }

  findByCode(code: string): Promise<OrganisationalUnitRecord | null> {
    return this.organisationalUnitRepository.findByCode(normalizeOrganisationalUnitCode(code));
  }

  async create(input: CreateOrganisationalUnitInput, actorUserId: string | null): Promise<OrganisationalUnitSummaryRecord> {
    const code = requireMatchingFormat(
      normalizeOrganisationalUnitCode(input.code),
      "code",
      isValidOrganisationalUnitCode,
      `upper-case letters and digits in hyphen-separated segments, at most ${ORGANISATIONAL_UNIT_FIELD_LIMIT.CODE_MAX_LENGTH} characters`,
    );

    return this.organisationalUnitRepository.create({
      code,
      name: validateName(input.name),
      unitType: input.unitType,
      parent: await this.resolveParent(input.unitType, input.parentId),
      description: validateDescription(input.description),
      createdByUserId: actorUserId,
    });
  }

  async update(id: string, input: UpdateOrganisationalUnitInput): Promise<OrganisationalUnitSummaryRecord> {
    const unit = await this.getById(id);
    const changes: UpdateOrganisationalUnitRecordInput = {};
    if (input.name !== undefined) changes.name = validateName(input.name);
    if (input.description !== undefined) changes.description = validateDescription(input.description);
    if (input.parentId !== undefined) {
      if (input.parentId === unit.id) throw organisationalUnitParentInvalid("A unit cannot be its own parent");
      changes.parent = await this.resolveParent(unit.unitType, input.parentId);
      if (movesDepartmentWithMembers(unit, changes.parent)) throw departmentWithMembersCannotMove(unit.memberCount);
    }
    return this.organisationalUnitRepository.update(id, changes);
  }

  async archive(id: string): Promise<OrganisationalUnitSummaryRecord> {
    const unit = await this.getById(id);
    if (unit.isArchived) return unit;
    if (unit.activeChildCount > 0) throw organisationalUnitHasActiveChildren(unit.activeChildCount);
    return this.organisationalUnitRepository.setArchivedAt(id, new Date());
  }

  async restore(id: string): Promise<OrganisationalUnitSummaryRecord> {
    const unit = await this.getById(id);
    if (!unit.isArchived) return unit;
    if (unit.parent?.isArchived) throw organisationalUnitParentArchived(unit.parent.name);
    return this.organisationalUnitRepository.setArchivedAt(id, null);
  }

  async delete(id: string): Promise<void> {
    const unit = await this.getById(id);
    if (unit.memberCount > 0 || unit.childCount > 0) throw organisationalUnitInUse(unit);
    await this.organisationalUnitRepository.delete(id);
  }

  private async resolveParent(
    unitType: OrganisationalUnitType,
    parentId: string | null,
  ): Promise<OrganisationalUnitParentKey | null> {
    const allowedParentTypes = ORGANISATIONAL_UNIT_HIERARCHY[unitType].allowedParentTypes.join(" or ");

    if (parentId === null) {
      if (requiresParent(unitType)) throw organisationalUnitParentInvalid(`A ${unitType} must belong to a ${allowedParentTypes}`);
      return null;
    }
    if (!canHaveParent(unitType)) throw organisationalUnitParentInvalid(`A ${unitType} cannot have a parent unit`);

    const parent = await this.organisationalUnitRepository.findById(parentId);
    if (!parent) throw organisationalUnitParentInvalid(`Parent organisational unit '${parentId}' not found`);
    if (!isAllowedParent(unitType, parent.unitType)) {
      throw organisationalUnitParentInvalid(`A ${unitType} can only be placed under a ${allowedParentTypes}`);
    }
    if (parent.isArchived) throw organisationalUnitParentArchived(parent.name);
    return { id: parent.id, unitType: parent.unitType };
  }
}

function movesDepartmentWithMembers(
  unit: OrganisationalUnitSummaryRecord,
  nextParent: OrganisationalUnitParentKey | null,
): boolean {
  return unit.unitType === OrganisationalUnitType.DEPARTMENT && unit.memberCount > 0 && unit.parent?.id !== nextParent?.id;
}

function validateName(raw: string): string {
  return requireTextLength(normalizeDisplayName(raw), "name", ORGANISATIONAL_UNIT_FIELD_LIMIT.NAME_MAX_LENGTH);
}

function validateDescription(raw: string | null): string | null {
  return requireOptionalTextLength(
    normalizeOptionalText(raw),
    "description",
    ORGANISATIONAL_UNIT_FIELD_LIMIT.DESCRIPTION_MAX_LENGTH,
  );
}
