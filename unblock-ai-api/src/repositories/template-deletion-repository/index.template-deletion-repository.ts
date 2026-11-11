import { PostgresTemplateDeletionRepository } from "./postgres.template-deletion-repository.js";
import {
  InMemoryTemplateDeletionRepository,
  type InMemoryTemplateDeletionRepositoryOptions,
} from "./in-memory.template-deletion-repository.js";
import { RepositoryBackend } from "../../data/constants/repository.constant.js";
import { ConfigurationError } from "../../errors/configuration.error.js";
import type { ITemplateDeletionRepository } from "./template-deletion-repository.interface.js";

export { PostgresTemplateDeletionRepository } from "./postgres.template-deletion-repository.js";
export { InMemoryTemplateDeletionRepository } from "./in-memory.template-deletion-repository.js";
export type { ITemplateDeletionRepository } from "./template-deletion-repository.interface.js";

export function createTemplateDeletionRepository(
  backend: RepositoryBackend,
  memorySeed: InMemoryTemplateDeletionRepositoryOptions = {},
): ITemplateDeletionRepository {
  if (backend === RepositoryBackend.POSTGRES) return new PostgresTemplateDeletionRepository();
  if (backend === RepositoryBackend.MEMORY) return new InMemoryTemplateDeletionRepository(memorySeed);
  throw new ConfigurationError(`Unknown repository backend '${String(backend)}'`);
}
