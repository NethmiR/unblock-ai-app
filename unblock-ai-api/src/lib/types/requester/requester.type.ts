import type { RequesterAttribute, RequesterProfileFactKind } from "../../../data/constants/requester.constant.js";
import type { DesignationReference } from "../designation/designation.type.js";
import type { OrganisationalUnitReference } from "../organisational-unit/organisational-unit.type.js";
import type { ActorType } from "../workflow/workflow.type.js";

export interface RequesterUnit {
  unit: OrganisationalUnitReference;
  parent: OrganisationalUnitReference | null;
  designations: DesignationReference[];
}

export interface RequesterProfileFact {
  id: string;
  kind: RequesterProfileFactKind;
  unit: OrganisationalUnitReference;
  parent: OrganisationalUnitReference | null;
  designation: DesignationReference | null;
}

export interface RequesterProfile {
  userId: string;
  fullName: string;
  email: string;
  units: RequesterUnit[];
  effectiveFaculties: OrganisationalUnitReference[];
  actorTypes: ActorType[];
  facts: RequesterProfileFact[];
}

export type RequesterAttributeValues = Readonly<Record<RequesterAttribute, string | null>>;
