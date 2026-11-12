import { PostgresDesignationRepository } from "./postgres.designation-repository.js";
import { InMemoryDesignationRepository } from "./in-memory.designation-repository.js";
import { InMemoryOrganisationStore } from "../in-memory-organisation-store.js";
import { RepositoryBackend } from "../../data/constants/repository.constant.js";
import { ConfigurationError } from "../../errors/configuration.error.js";
import type { IDesignationRepository } from "./designation-repository.interface.js";

export { PostgresDesignationRepository } from "./postgres.designation-repository.js";
export { InMemoryDesignationRepository } from "./in-memory.designation-repository.js";
export type { IDesignationRepository } from "./designation-repository.interface.js";

export function createDesignationRepository(
  backend: RepositoryBackend,
  store: InMemoryOrganisationStore = new InMemoryOrganisationStore(),
): IDesignationRepository {
  if (backend === RepositoryBackend.POSTGRES) return new PostgresDesignationRepository();
  if (backend === RepositoryBackend.MEMORY) return new InMemoryDesignationRepository(store);
  throw new ConfigurationError(`Unknown repository backend '${String(backend)}'`);
}
