import { randomUUID } from "node:crypto";
import { ORGANISATIONAL_UNIT_TYPES } from "../../data/constants/organisational-unit.constant.js";
import { ValidationError } from "../../errors/validation.error.js";
import { emptyCountByUnitType } from "../../utils/organisation/organisational-unit-type.util.js";
import { compareDesignations } from "../../utils/organisation/designation-reference.util.js";
import { findDuplicates, uniqueValues } from "../../utils/shared/collection.util.js";
import {
  designationCodeTaken,
  designationInUse,
  designationNotFound,
  designationSingleHolderViolated,
  designationTitleTaken,
  designationUnitTypeInUse,
} from "../../errors/designation.error.js";
import type { InMemoryOrganisationStore, StoredDesignation } from "../in-memory-organisation-store.js";
import type { IDesignationRepository } from "./designation-repository.interface.js";
import type { OrganisationalUnitType } from "../../data/constants/organisational-unit.constant.js";
import type {
  CreateDesignationRecordInput,
  DesignationHolderCountByUnitType,
  DesignationRecord,
  DesignationSummaryRecord,
  UpdateDesignationInput,
} from "../../lib/types/designation/designation.type.js";

export class InMemoryDesignationRepository implements IDesignationRepository {
  constructor(private readonly store: InMemoryOrganisationStore) {}

  async list(includeArchived: boolean): Promise<DesignationSummaryRecord[]> {
    return [...this.store.designations.values()]
      .filter((designation) => includeArchived || designation.archivedAt === null)
      .map((designation) => this.store.toDesignationSummary(designation))
      .sort(compareDesignations);
  }

  async findById(id: string): Promise<DesignationSummaryRecord | null> {
    const designation = this.store.designations.get(id);
    return designation ? this.store.toDesignationSummary(designation) : null;
  }

  async findByIds(ids: readonly string[]): Promise<DesignationRecord[]> {
    return ids.flatMap((id) => {
      const designation = this.store.designations.get(id);
      return designation ? [this.store.toDesignationRecord(designation)] : [];
    });
  }

  async findByCode(code: string): Promise<DesignationRecord | null> {
    const designation = [...this.store.designations.values()].find((candidate) => candidate.code === code);
    return designation ? this.store.toDesignationRecord(designation) : null;
  }

  async countHoldersByUnitType(id: string): Promise<DesignationHolderCountByUnitType> {
    const counts = emptyCountByUnitType();
    for (const assignment of this.store.assignmentsOfDesignation(id)) {
      const unit = this.store.units.get(assignment.organisationalUnitId);
      if (unit) counts[unit.unitType] += 1;
    }
    return counts;
  }

  async findUnitsWithMultipleHolders(id: string): Promise<string[]> {
    return findDuplicates(this.store.assignmentsOfDesignation(id).map((assignment) => assignment.organisationalUnitId));
  }

  async create(input: CreateDesignationRecordInput): Promise<DesignationSummaryRecord> {
    if ([...this.store.designations.values()].some((designation) => designation.code === input.code)) {
      throw designationCodeTaken(input.code);
    }
    this.assertTitleAvailable(input.title, null);
    this.assertHasUnitTypes(input.applicableUnitTypes);

    const now = new Date();
    const designation: StoredDesignation = {
      id: randomUUID(),
      code: input.code,
      title: input.title,
      category: input.category,
      applicableUnitTypes: uniqueValues(input.applicableUnitTypes),
      singleHolderPerUnit: input.singleHolderPerUnit,
      displayOrder: input.displayOrder,
      archivedAt: null,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    };
    this.store.designations.set(designation.id, designation);
    return this.store.toDesignationSummary(designation);
  }

  async update(id: string, input: UpdateDesignationInput): Promise<DesignationSummaryRecord> {
    const designation = this.requireStored(id);
    if (input.title !== undefined) this.assertTitleAvailable(input.title, id);
    if (input.applicableUnitTypes !== undefined) {
      this.assertHasUnitTypes(input.applicableUnitTypes);
      await this.assertRemovedUnitTypesUnused(id, input.applicableUnitTypes);
    }
    if (input.singleHolderPerUnit === true) {
      const conflictingUnitIds = await this.findUnitsWithMultipleHolders(id);
      if (conflictingUnitIds.length > 0) throw designationSingleHolderViolated(conflictingUnitIds);
    }

    if (input.title !== undefined) designation.title = input.title;
    if (input.category !== undefined) designation.category = input.category;
    if (input.applicableUnitTypes !== undefined) designation.applicableUnitTypes = uniqueValues(input.applicableUnitTypes);
    if (input.singleHolderPerUnit !== undefined) designation.singleHolderPerUnit = input.singleHolderPerUnit;
    if (input.displayOrder !== undefined) designation.displayOrder = input.displayOrder;
    designation.updatedAt = new Date();
    return this.store.toDesignationSummary(designation);
  }

  async setArchivedAt(id: string, archivedAt: Date | null): Promise<DesignationSummaryRecord> {
    const designation = this.requireStored(id);
    designation.archivedAt = archivedAt;
    designation.updatedAt = new Date();
    return this.store.toDesignationSummary(designation);
  }

  async delete(id: string): Promise<void> {
    this.requireStored(id);
    const holderCount = this.store.assignmentsOfDesignation(id).length;
    if (holderCount > 0) throw designationInUse(holderCount);
    this.store.designations.delete(id);
  }

  private requireStored(id: string): StoredDesignation {
    const designation = this.store.designations.get(id);
    if (!designation) throw designationNotFound(id);
    return designation;
  }

  private assertTitleAvailable(title: string, excludeId: string | null): void {
    const target = title.toLowerCase();
    const taken = [...this.store.designations.values()].some(
      (designation) => designation.id !== excludeId && designation.title.toLowerCase() === target,
    );
    if (taken) throw designationTitleTaken(title);
  }

  private assertHasUnitTypes(unitTypes: readonly OrganisationalUnitType[]): void {
    if (unitTypes.length === 0) throw new ValidationError("A designation must apply to at least one unit type");
  }

  private async assertRemovedUnitTypesUnused(id: string, kept: readonly OrganisationalUnitType[]): Promise<void> {
    const counts = await this.countHoldersByUnitType(id);
    const blocked = ORGANISATIONAL_UNIT_TYPES.find((unitType) => counts[unitType] > 0 && !kept.includes(unitType));
    if (blocked) throw designationUnitTypeInUse(blocked, counts[blocked]);
  }
}
