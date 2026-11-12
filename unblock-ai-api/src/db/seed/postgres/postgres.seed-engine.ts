import { fileURLToPath } from "node:url";
import { createSeedEngine, type SeedEngine } from "../core/seed.engine.js";
import { POSTGRES_SEED_TEMPLATE } from "./postgres.seed-template.js";
import { closePool } from "../../postgres.client.js";
import { user as userConfig } from "../../../config/user.config.js";
import { loadSeedConfig } from "../../../config/seed.config.js";
import { createPostgresRepositoryRegistry } from "../../../repositories/repository-registry.factory.js";
import { UserService } from "../../../services/user.service.js";
import { OrganisationalUnitService } from "../../../services/organisational-unit.service.js";
import { DesignationService } from "../../../services/designation.service.js";
import { UserAffiliationService } from "../../../services/user-affiliation.service.js";
import type { PostgresSeedContext } from "./postgres.seed-context.js";

const SEEDERS_DIRECTORY = fileURLToPath(new URL("./seeders", import.meta.url));

async function createPostgresSeedContext(): Promise<PostgresSeedContext> {
  const { userRepository, userAffiliationRepository, organisationalUnitRepository, designationRepository } =
    createPostgresRepositoryRegistry();
  return {
    userService: new UserService({ userRepository, userAffiliationRepository, userConfig }),
    organisationalUnitService: new OrganisationalUnitService({ organisationalUnitRepository }),
    designationService: new DesignationService({ designationRepository }),
    userAffiliationService: new UserAffiliationService({
      userAffiliationRepository,
      organisationalUnitRepository,
      designationRepository,
      userRepository,
    }),
    seedConfig: loadSeedConfig(),
  };
}

export function createPostgresSeedEngine(): SeedEngine<PostgresSeedContext> {
  return createSeedEngine({
    label: "postgres",
    directory: SEEDERS_DIRECTORY,
    template: POSTGRES_SEED_TEMPLATE,
    createContext: createPostgresSeedContext,
    close: closePool,
  });
}
