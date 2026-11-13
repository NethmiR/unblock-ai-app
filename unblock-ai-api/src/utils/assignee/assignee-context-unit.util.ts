import { OrganisationalUnitType } from "../../data/constants/organisational-unit.constant.js";
import { audienceUnitIds, isUnitInAudience } from "../selection/candidate-eligibility.util.js";
import type { DesignationRecord } from "../../lib/types/designation/designation.type.js";
import type { OrganisationCatalogue } from "../../lib/types/organisation/organisation-catalogue.type.js";
import type { OrganisationalUnitReference } from "../../lib/types/organisational-unit/organisational-unit.type.js";
import type { RequesterProfile, RequesterUnit } from "../../lib/types/requester/requester.type.js";
import type { WorkflowTemplateAudience } from "../../lib/types/selection/eligibility.type.js";

function isDivisionOnly(designation: DesignationRecord): boolean {
  return designation.applicableUnitTypes.length > 0
    && designation.applicableUnitTypes.every((unitType) => unitType === OrganisationalUnitType.DIVISION);
}

function narrowToAudience(
  units: readonly RequesterUnit[],
  audience: WorkflowTemplateAudience,
  catalogue: OrganisationCatalogue,
): RequesterUnit[] {
  if (audience.organisationalUnitCodes.length === 0) return [...units];
  const audienceIds = audienceUnitIds(audience, catalogue);
  return units.filter(({ unit, parent }) => isUnitInAudience(unit, parent, audienceIds));
}

function withEffectiveFaculties(units: readonly RequesterUnit[]): OrganisationalUnitReference[] {
  const result = new Map<string, OrganisationalUnitReference>();
  for (const { unit, parent } of units) {
    result.set(unit.id, unit);
    if (parent?.unitType === OrganisationalUnitType.FACULTY) result.set(parent.id, parent);
  }
  return [...result.values()];
}

export function contextUnitIds(
  profile: RequesterProfile,
  audience: WorkflowTemplateAudience,
  designation: DesignationRecord,
  catalogue: OrganisationCatalogue,
): string[] | null {
  const hasDivisionMembership = profile.units.some(({ unit }) => unit.unitType === OrganisationalUnitType.DIVISION);
  if (isDivisionOnly(designation) && !hasDivisionMembership) return null;

  const applicable = new Set(designation.applicableUnitTypes);
  return withEffectiveFaculties(narrowToAudience(profile.units, audience, catalogue))
    .filter((unit) => applicable.has(unit.unitType))
    .map((unit) => unit.id);
}
