import { SAMPLE_USER_EMAIL } from "../../data/constants/seed.constant.js";
import type { SampleUserProfileSeed, SampleUserSeed } from "../../lib/types/seed/sample-user-seed.type.js";

export function sampleUserEmail(sequenceNumber: number): string {
  return `${SAMPLE_USER_EMAIL.LOCAL_PART_PREFIX}${sequenceNumber}@${SAMPLE_USER_EMAIL.DOMAIN}`;
}

export function toSampleUserSeeds(profiles: readonly SampleUserProfileSeed[]): SampleUserSeed[] {
  return profiles.map((profile, index) => ({ ...profile, email: sampleUserEmail(index + 1) }));
}
