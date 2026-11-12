import { SeedEntity, SeedOutcomeStatus } from "../../../../data/constants/seed.constant.js";
import { SeedError } from "../../../../errors/seed.error.js";
import { UNIVERSITY_OF_MORATUWA_SAMPLE_USERS } from "../../data/university-of-moratuwa/sample-users.seed-data.js";
import type { Seeder, SeedOutcome } from "../../../../lib/types/seed/index.type.js";
import type { SampleMembershipSeed } from "../../../../lib/types/seed/sample-user-seed.type.js";
import type { MembershipInput } from "../../../../lib/types/user-affiliation/user-affiliation.type.js";
import type { PostgresSeedContext } from "../postgres.seed-context.js";

async function resolveMembership(
  { organisationalUnitService, designationService }: PostgresSeedContext,
  membership: SampleMembershipSeed,
): Promise<MembershipInput> {
  const unit = await organisationalUnitService.findByCode(membership.organisationalUnitCode);
  if (!unit) throw new SeedError(`Organisational unit '${membership.organisationalUnitCode}' has not been seeded`);

  const designationIds: string[] = [];
  for (const code of membership.designationCodes) {
    const designation = await designationService.findByCode(code);
    if (!designation) throw new SeedError(`Designation '${code}' has not been seeded`);
    designationIds.push(designation.id);
  }
  return { organisationalUnitId: unit.id, designationIds };
}

const seeder: Seeder<PostgresSeedContext> = {
  async run(context) {
    if (!context.seedConfig.sampleUsersEnabled) return [];

    const outcomes: SeedOutcome[] = [];
    for (const seed of UNIVERSITY_OF_MORATUWA_SAMPLE_USERS) {
      if (await context.userService.existsByEmail(seed.email)) {
        outcomes.push({ entity: SeedEntity.USER, key: seed.email, status: SeedOutcomeStatus.SKIPPED });
        continue;
      }

      const memberships: MembershipInput[] = [];
      for (const membership of seed.memberships) memberships.push(await resolveMembership(context, membership));

      const user = await context.userService.createUser(
        { email: seed.email, fullName: seed.fullName, permissions: [...seed.permissions] },
        null,
      );
      await context.userAffiliationService.replaceForUser(user.id, { memberships }, null);
      outcomes.push({ entity: SeedEntity.USER, key: seed.email, status: SeedOutcomeStatus.CREATED });
    }
    return outcomes;
  },
};

export default seeder;
