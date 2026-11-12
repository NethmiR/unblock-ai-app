import { PostgresOrganisationalUnitRepository } from "./postgres.organisational-unit-repository.js";
import { InMemoryOrganisationalUnitRepository } from "./in-memory.organisational-unit-repository.js";
import { InMemoryOrganisationStore } from "../in-memory-organisation-store.js";
import { RepositoryBackend } from "../../data/constants/repository.constant.js";
import { ConfigurationError } from "../../errors/configuration.error.js";
import type { IOrganisationalUnitRepository } from "./organisational-unit-repository.interface.js";

export { PostgresOrganisationalUnitRepository } from "./postgres.organisational-unit-repository.js";
export { InMemoryOrganisationalUnitRepository } from "./in-memory.organisational-unit-repository.js";
export type { IOrganisationalUnitRepository } from "./organisational-unit-repository.interface.js";

export function createOrganisationalUnitRepository(
  backend: RepositoryBackend,
  store: InMemoryOrganisationStore = new InMemoryOrganisationStore(),
): IOrganisationalUnitRepository {
  if (backend === RepositoryBackend.POSTGRES) return new PostgresOrganisationalUnitRepository();
  if (backend === RepositoryBackend.MEMORY) return new InMemoryOrganisationalUnitRepository(store);
  throw new ConfigurationError(`Unknown repository backend '${String(backend)}'`);
}
