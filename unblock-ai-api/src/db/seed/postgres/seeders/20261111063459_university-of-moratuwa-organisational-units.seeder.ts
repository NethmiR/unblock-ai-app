import { SeedEntity, SeedOutcomeStatus } from "../../../../data/constants/seed.constant.js";
import { SeedError } from "../../../../errors/seed.error.js";
import { flattenOrganisationalUnitSeeds } from "../../../../utils/seed/organisation-seed.util.js";
import { UNIVERSITY_OF_MORATUWA_ORGANISATIONAL_UNITS } from "../../data/university-of-moratuwa/organisational-units.seed-data.js";
import type { Seeder, SeedOutcome } from "../../../../lib/types/seed/index.type.js";
import type { PostgresSeedContext } from "../postgres.seed-context.js";

const seeder: Seeder<PostgresSeedContext> = {
  async run({ organisationalUnitService }) {
    const outcomes: SeedOutcome[] = [];
    const unitIdsByCode = new Map<string, string>();

    for (const { seed, parentCode } of flattenOrganisationalUnitSeeds(UNIVERSITY_OF_MORATUWA_ORGANISATIONAL_UNITS)) {
      const existing = await organisationalUnitService.findByCode(seed.code);
      if (existing) {
        unitIdsByCode.set(seed.code, existing.id);
        outcomes.push({ entity: SeedEntity.ORGANISATIONAL_UNIT, key: seed.code, status: SeedOutcomeStatus.SKIPPED });
        continue;
      }

      const parentId = parentCode === null ? null : unitIdsByCode.get(parentCode);
      if (parentId === undefined) throw new SeedError(`Parent '${parentCode}' of '${seed.code}' was not seeded`);

      const created = await organisationalUnitService.create(
        { code: seed.code, name: seed.name, unitType: seed.unitType, parentId, description: null },
        null,
      );
      unitIdsByCode.set(seed.code, created.id);
      outcomes.push({ entity: SeedEntity.ORGANISATIONAL_UNIT, key: seed.code, status: SeedOutcomeStatus.CREATED });
    }

    return outcomes;
  },
};

export default seeder;
