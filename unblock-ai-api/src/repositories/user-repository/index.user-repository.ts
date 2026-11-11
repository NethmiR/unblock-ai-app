import { PostgresUserRepository } from "./postgres.user-repository.js";
import { InMemoryUserRepository, type InMemoryUserRepositoryOptions } from "./in-memory.user-repository.js";
import { RepositoryBackend } from "../../data/constants/repository.constant.js";
import { ConfigurationError } from "../../errors/configuration.error.js";
import type { IUserRepository } from "./user-repository.interface.js";

export { PostgresUserRepository } from "./postgres.user-repository.js";
export { InMemoryUserRepository } from "./in-memory.user-repository.js";
export type { IUserRepository } from "./user-repository.interface.js";

export function createUserRepository(
  backend: RepositoryBackend,
  memorySeed: InMemoryUserRepositoryOptions = {},
): IUserRepository {
  if (backend === RepositoryBackend.POSTGRES) return new PostgresUserRepository();
  if (backend === RepositoryBackend.MEMORY) return new InMemoryUserRepository(memorySeed);
  throw new ConfigurationError(`Unknown repository backend '${String(backend)}'`);
}
