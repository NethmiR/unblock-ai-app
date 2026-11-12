import { randomUUID } from "node:crypto";
import { isAllowedParent } from "../../utils/organisation/organisational-unit-hierarchy.util.js";
import { compareOrganisationalUnits } from "../../utils/user-affiliation/membership-order.util.js";
import {
  departmentWithMembersCannotMove,
  organisationalUnitCodeTaken,
  organisationalUnitInUse,
  organisationalUnitNameTaken,
  organisationalUnitNotFound,
  organisationalUnitParentInvalid,
} from "../../errors/organisational-unit.error.js";
import type { InMemoryOrganisationStore, StoredOrganisationalUnit } from "../in-memory-organisation-store.js";
import type { IOrganisationalUnitRepository } from "./organisational-unit-repository.interface.js";
import { OrganisationalUnitType } from "../../data/constants/organisational-unit.constant.js";
import type {
  CreateOrganisationalUnitRecordInput,
  OrganisationalUnitListFilter,
  OrganisationalUnitParentKey,
  OrganisationalUnitRecord,
  OrganisationalUnitSummaryRecord,
  UpdateOrganisationalUnitRecordInput,
} from "../../lib/types/organisational-unit/organisational-unit.type.js";

export class InMemoryOrganisationalUnitRepository implements IOrganisationalUnitRepository {
  constructor(private readonly store: InMemoryOrganisationStore) {}

  async list(filter: OrganisationalUnitListFilter): Promise<OrganisationalUnitSummaryRecord[]> {
    return [...this.store.units.values()]
      .filter((unit) => filter.unitType === null || unit.unitType === filter.unitType)
      .filter((unit) => !filter.rootOnly || unit.parentId === null)
      .filter((unit) => filter.parentId === null || unit.parentId === filter.parentId)
      .filter((unit) => filter.includeArchived || unit.archivedAt === null)
      .map((unit) => this.store.toUnitSummary(unit))
      .sort(compareOrganisationalUnits);
  }

  async findById(id: string): Promise<OrganisationalUnitSummaryRecord | null> {
    const unit = this.store.units.get(id);
    return unit ? this.store.toUnitSummary(unit) : null;
  }

  async findByIds(ids: readonly string[]): Promise<OrganisationalUnitRecord[]> {
    return ids.flatMap((id) => {
      const unit = this.store.units.get(id);
      return unit ? [this.store.toUnitRecord(unit)] : [];
    });
  }

  async findByCode(code: string): Promise<OrganisationalUnitRecord | null> {
    const unit = [...this.store.units.values()].find((candidate) => candidate.code === code);
    return unit ? this.store.toUnitRecord(unit) : null;
  }

  async create(input: CreateOrganisationalUnitRecordInput): Promise<OrganisationalUnitSummaryRecord> {
    if ([...this.store.units.values()].some((unit) => unit.code === input.code)) {
      throw organisationalUnitCodeTaken(input.code);
    }
    this.assertValidParent(input.unitType, input.parent);
    this.assertNameAvailable(input.name, input.unitType, input.parent?.id ?? null, null);

    const now = new Date();
    const unit: StoredOrganisationalUnit = {
      id: randomUUID(),
      code: input.code,
      name: input.name,
      unitType: input.unitType,
      parentId: input.parent?.id ?? null,
      description: input.description,
      archivedAt: null,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    };
    this.store.units.set(unit.id, unit);
    return this.store.toUnitSummary(unit);
  }

  async update(id: string, input: UpdateOrganisationalUnitRecordInput): Promise<OrganisationalUnitSummaryRecord> {
    const unit = this.requireStored(id);
    const parentId = input.parent === undefined ? unit.parentId : (input.parent?.id ?? null);
    if (input.parent !== undefined) this.assertValidParent(unit.unitType, input.parent);
    this.assertNameAvailable(input.name ?? unit.name, unit.unitType, parentId, unit.id);
    this.assertMembersStayInFaculty(unit, parentId);

    if (input.name !== undefined) unit.name = input.name;
    if (input.description !== undefined) unit.description = input.description;
    unit.parentId = parentId;
    unit.updatedAt = new Date();
    return this.store.toUnitSummary(unit);
  }

  async setArchivedAt(id: string, archivedAt: Date | null): Promise<OrganisationalUnitSummaryRecord> {
    const unit = this.requireStored(id);
    unit.archivedAt = archivedAt;
    unit.updatedAt = new Date();
    return this.store.toUnitSummary(unit);
  }

  async delete(id: string): Promise<void> {
    const unit = this.requireStored(id);
    const summary = this.store.toUnitSummary(unit);
    if (summary.memberCount > 0 || summary.childCount > 0) throw organisationalUnitInUse(summary);
    this.store.units.delete(id);
  }

  private assertMembersStayInFaculty(unit: StoredOrganisationalUnit, nextParentId: string | null): void {
    if (unit.unitType !== OrganisationalUnitType.DEPARTMENT || nextParentId === unit.parentId) return;
    const memberIds = this.store.membershipsOfUnit(unit.id).map((membership) => membership.userId);
    const strandedCount = memberIds.filter(
      (userId) => !this.store.membershipsOfUser(userId).some((membership) => membership.organisationalUnitId === nextParentId),
    ).length;
    if (strandedCount > 0) throw departmentWithMembersCannotMove(strandedCount);
  }

  private requireStored(id: string): StoredOrganisationalUnit {
    const unit = this.store.units.get(id);
    if (!unit) throw organisationalUnitNotFound(id);
    return unit;
  }

  private assertValidParent(unitType: OrganisationalUnitType, parent: OrganisationalUnitParentKey | null): void {
    const storedParent = parent === null ? null : this.store.units.get(parent.id);
    if (parent !== null && (!storedParent || storedParent.unitType !== parent.unitType)) {
      throw organisationalUnitParentInvalid("The parent organisational unit does not exist");
    }
    if (!isAllowedParent(unitType, storedParent?.unitType ?? null)) {
      throw organisationalUnitParentInvalid(`A ${unitType} cannot be placed under this parent`);
    }
  }

  private assertNameAvailable(
    name: string,
    unitType: OrganisationalUnitType,
    parentId: string | null,
    excludeId: string | null,
  ): void {
    const target = name.toLowerCase();
    const taken = [...this.store.units.values()].some(
      (unit) =>
        unit.id !== excludeId &&
        unit.unitType === unitType &&
        unit.parentId === parentId &&
        unit.name.toLowerCase() === target,
    );
    if (taken) throw organisationalUnitNameTaken(name);
  }
}
