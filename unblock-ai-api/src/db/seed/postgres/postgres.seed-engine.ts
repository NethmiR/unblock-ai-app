import { fileURLToPath } from "node:url";
import { createSeedEngine, type SeedEngine } from "../core/seed.engine.js";
import { POSTGRES_SEED_TEMPLATE } from "./postgres.seed-template.js";
import { closePool } from "../../postgres.client.js";
import { user as userConfig } from "../../../config/user.config.js";
import { loadSeedConfig } from "../../../config/seed.config.js";
import { PostgresUserRepository } from "../../../repositories/user-repository/postgres.user-repository.js";
import { UserService } from "../../../services/user.service.js";
import type { PostgresSeedContext } from "./postgres.seed-context.js";

const SEEDERS_DIRECTORY = fileURLToPath(new URL("./seeders", import.meta.url));

async function createPostgresSeedContext(): Promise<PostgresSeedContext> {
  return {
    userService: new UserService({ userRepository: new PostgresUserRepository(), userConfig }),
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
