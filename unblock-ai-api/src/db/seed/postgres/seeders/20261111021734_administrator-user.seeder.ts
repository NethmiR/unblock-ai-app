import { normalizeEmail } from "../../../../utils/user/email.util.js";
import { PERMISSIONS } from "../../../../data/constants/permission.constant.js";
import { SeedEntity, SeedOutcomeStatus } from "../../../../data/constants/seed.constant.js";
import type { Seeder } from "../../../../lib/types/seed/index.type.js";
import type { PostgresSeedContext } from "../postgres.seed-context.js";

const seeder: Seeder<PostgresSeedContext> = {
  async run({ userService, seedConfig }) {
    const email = normalizeEmail(seedConfig.administratorEmail);

    if (await userService.existsByEmail(email)) {
      return [{ entity: SeedEntity.USER, key: email, status: SeedOutcomeStatus.SKIPPED }];
    }

    await userService.createUser(
      { email, fullName: seedConfig.administratorFullName, permissions: [...PERMISSIONS] },
      null,
    );
    return [{ entity: SeedEntity.USER, key: email, status: SeedOutcomeStatus.CREATED }];
  },
};

export default seeder;
