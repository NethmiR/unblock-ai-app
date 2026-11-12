import { SeedEntity, SeedOutcomeStatus } from "../../../../data/constants/seed.constant.js";
import { UNIVERSITY_OF_MORATUWA_DESIGNATIONS } from "../../data/university-of-moratuwa/designations.seed-data.js";
import type { Seeder, SeedOutcome } from "../../../../lib/types/seed/index.type.js";
import type { PostgresSeedContext } from "../postgres.seed-context.js";

const seeder: Seeder<PostgresSeedContext> = {
  async run({ designationService }) {
    const outcomes: SeedOutcome[] = [];

    for (const seed of UNIVERSITY_OF_MORATUWA_DESIGNATIONS) {
      if (await designationService.findByCode(seed.code)) {
        outcomes.push({ entity: SeedEntity.DESIGNATION, key: seed.code, status: SeedOutcomeStatus.SKIPPED });
        continue;
      }

      await designationService.create({ ...seed, applicableUnitTypes: [...seed.applicableUnitTypes] }, null);
      outcomes.push({ entity: SeedEntity.DESIGNATION, key: seed.code, status: SeedOutcomeStatus.CREATED });
    }

    return outcomes;
  },
};

export default seeder;
