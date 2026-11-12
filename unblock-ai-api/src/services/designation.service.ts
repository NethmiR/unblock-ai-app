import { DESIGNATION_FIELD_LIMIT } from "../data/constants/designation.constant.js";
import {
  ORGANISATIONAL_UNIT_TYPES,
  type OrganisationalUnitType,
} from "../data/constants/organisational-unit.constant.js";
import { ValidationError } from "../errors/validation.error.js";
import {
  designationInUse,
  designationNotFound,
  designationSingleHolderViolated,
  designationUnitTypeInUse,
} from "../errors/designation.error.js";
import { isValidDesignationCode, normalizeDesignationCode } from "../utils/organisation/designation-code.util.js";
import { sortOrganisationalUnitTypes } from "../utils/organisation/organisational-unit-type.util.js";
import { normalizeDisplayName } from "../utils/shared/text.util.js";
import { findDuplicates } from "../utils/shared/collection.util.js";
import {
  requireIntegerInRange,
  requireMatchingFormat,
  requireTextLength,
} from "../utils/shared/field-validation.util.js";
import type { IDesignationRepository } from "../repositories/designation-repository/designation-repository.interface.js";
import type {
  CreateDesignationInput,
  DesignationRecord,
  DesignationSummaryRecord,
  UpdateDesignationInput,
} from "../lib/types/designation/designation.type.js";

export interface DesignationServiceOptions {
  designationRepository: IDesignationRepository;
}

export class DesignationService {
  private readonly designationRepository: IDesignationRepository;

  constructor({ designationRepository }: DesignationServiceOptions) {
    this.designationRepository = designationRepository;
  }

  list(includeArchived: boolean): Promise<DesignationSummaryRecord[]> {
    return this.designationRepository.list(includeArchived);
  }

  async getById(id: string): Promise<DesignationSummaryRecord> {
    const designation = await this.designationRepository.findById(id);
    if (!designation) throw designationNotFound(id);
    return designation;
  }

  findByCode(code: string): Promise<DesignationRecord | null> {
    return this.designationRepository.findByCode(normalizeDesignationCode(code));
  }

  async create(input: CreateDesignationInput, actorUserId: string | null): Promise<DesignationSummaryRecord> {
    const code = requireMatchingFormat(
      normalizeDesignationCode(input.code),
      "code",
      isValidDesignationCode,
      `lower-case letters and digits in underscore-separated segments, at most ${DESIGNATION_FIELD_LIMIT.CODE_MAX_LENGTH} characters`,
    );

    return this.designationRepository.create({
      code,
      title: validateTitle(input.title),
      category: input.category,
      applicableUnitTypes: validateUnitTypes(input.applicableUnitTypes),
      singleHolderPerUnit: input.singleHolderPerUnit,
      displayOrder: validateDisplayOrder(input.displayOrder),
      createdByUserId: actorUserId,
    });
  }

  async update(id: string, input: UpdateDesignationInput): Promise<DesignationSummaryRecord> {
    const designation = await this.getById(id);
    const changes: UpdateDesignationInput = {};
    if (input.title !== undefined) changes.title = validateTitle(input.title);
    if (input.category !== undefined) changes.category = input.category;
    if (input.displayOrder !== undefined) changes.displayOrder = validateDisplayOrder(input.displayOrder);
    if (input.applicableUnitTypes !== undefined) {
      changes.applicableUnitTypes = validateUnitTypes(input.applicableUnitTypes);
      await this.assertRemovedUnitTypesUnused(id, changes.applicableUnitTypes);
    }
    if (input.singleHolderPerUnit !== undefined) {
      if (input.singleHolderPerUnit && !designation.singleHolderPerUnit) {
        const conflictingUnitIds = await this.designationRepository.findUnitsWithMultipleHolders(id);
        if (conflictingUnitIds.length > 0) throw designationSingleHolderViolated(conflictingUnitIds);
      }
      changes.singleHolderPerUnit = input.singleHolderPerUnit;
    }
    return this.designationRepository.update(id, changes);
  }

  async archive(id: string): Promise<DesignationSummaryRecord> {
    const designation = await this.getById(id);
    return designation.isArchived ? designation : this.designationRepository.setArchivedAt(id, new Date());
  }

  async restore(id: string): Promise<DesignationSummaryRecord> {
    const designation = await this.getById(id);
    return designation.isArchived ? this.designationRepository.setArchivedAt(id, null) : designation;
  }

  async delete(id: string): Promise<void> {
    const designation = await this.getById(id);
    if (designation.holderCount > 0) throw designationInUse(designation.holderCount);
    await this.designationRepository.delete(id);
  }

  private async assertRemovedUnitTypesUnused(id: string, kept: readonly OrganisationalUnitType[]): Promise<void> {
    const counts = await this.designationRepository.countHoldersByUnitType(id);
    const blocked = ORGANISATIONAL_UNIT_TYPES.find((unitType) => counts[unitType] > 0 && !kept.includes(unitType));
    if (blocked) throw designationUnitTypeInUse(blocked, counts[blocked]);
  }
}

function validateTitle(raw: string): string {
  return requireTextLength(normalizeDisplayName(raw), "title", DESIGNATION_FIELD_LIMIT.TITLE_MAX_LENGTH);
}

function validateDisplayOrder(value: number): number {
  return requireIntegerInRange(value, "display_order", 0, DESIGNATION_FIELD_LIMIT.DISPLAY_ORDER_MAX);
}

function validateUnitTypes(unitTypes: readonly OrganisationalUnitType[]): OrganisationalUnitType[] {
  if (unitTypes.length === 0) {
    throw new ValidationError("applicable_unit_types must contain at least one unit type", {
      details: { field: "applicable_unit_types" },
    });
  }
  if (findDuplicates(unitTypes).length > 0) {
    throw new ValidationError("applicable_unit_types must not contain duplicates", {
      details: { field: "applicable_unit_types" },
    });
  }
  return sortOrganisationalUnitTypes(unitTypes);
}
