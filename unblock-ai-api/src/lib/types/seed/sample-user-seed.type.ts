import type { Permission } from "../../../data/constants/permission.constant.js";

export interface SampleMembershipSeed {
  organisationalUnitCode: string;
  designationCodes: readonly string[];
}

export interface SampleUserProfileSeed {
  fullName: string;
  permissions: readonly Permission[];
  memberships: readonly SampleMembershipSeed[];
}

export interface SampleUserSeed extends SampleUserProfileSeed {
  email: string;
}
