import { PostgresUserSessionRepository } from "./postgres.user-session-repository.js";
import {
  InMemoryUserSessionRepository,
  type InMemoryUserSessionRepositoryOptions,
} from "./in-memory.user-session-repository.js";
import { RepositoryBackend } from "../../data/constants/repository.constant.js";
import { ConfigurationError } from "../../errors/configuration.error.js";
import type { IUserSessionRepository } from "./user-session-repository.interface.js";

export { PostgresUserSessionRepository } from "./postgres.user-session-repository.js";
export { InMemoryUserSessionRepository } from "./in-memory.user-session-repository.js";
export type { IUserSessionRepository } from "./user-session-repository.interface.js";

export function createUserSessionRepository(
  backend: RepositoryBackend,
  memorySeed: InMemoryUserSessionRepositoryOptions = {},
): IUserSessionRepository {
  if (backend === RepositoryBackend.POSTGRES) return new PostgresUserSessionRepository();
  if (backend === RepositoryBackend.MEMORY) return new InMemoryUserSessionRepository(memorySeed);
  throw new ConfigurationError(`Unknown repository backend '${String(backend)}'`);
}
