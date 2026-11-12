import { PostgresUserAffiliationRepository } from "./postgres.user-affiliation-repository.js";
import {
  InMemoryUserAffiliationRepository,
  type InMemoryUserAffiliationRepositoryOptions,
} from "./in-memory.user-affiliation-repository.js";
import { RepositoryBackend } from "../../data/constants/repository.constant.js";
import { ConfigurationError } from "../../errors/configuration.error.js";
import type { IUserAffiliationRepository } from "./user-affiliation-repository.interface.js";

export { PostgresUserAffiliationRepository } from "./postgres.user-affiliation-repository.js";
export { InMemoryUserAffiliationRepository } from "./in-memory.user-affiliation-repository.js";
export type { IUserAffiliationRepository } from "./user-affiliation-repository.interface.js";

export function createUserAffiliationRepository(
  backend: RepositoryBackend,
  memoryOptions: InMemoryUserAffiliationRepositoryOptions,
): IUserAffiliationRepository {
  if (backend === RepositoryBackend.POSTGRES) return new PostgresUserAffiliationRepository();
  if (backend === RepositoryBackend.MEMORY) return new InMemoryUserAffiliationRepository(memoryOptions);
  throw new ConfigurationError(`Unknown repository backend '${String(backend)}'`);
}
