import { RepositoryBackend } from "../data/constants/repository.constant.js";
import { ConfigurationError } from "../errors/configuration.error.js";
import { InMemoryOrganisationStore } from "./in-memory-organisation-store.js";
import { InMemoryUserRepository, PostgresUserRepository } from "./user-repository/index.user-repository.js";
import {
  InMemoryUserSessionRepository,
  PostgresUserSessionRepository,
} from "./user-session-repository/index.user-session-repository.js";
import {
  InMemoryOrganisationalUnitRepository,
  PostgresOrganisationalUnitRepository,
} from "./organisational-unit-repository/index.organisational-unit-repository.js";
import {
  InMemoryDesignationRepository,
  PostgresDesignationRepository,
} from "./designation-repository/index.designation-repository.js";
import {
  InMemoryUserAffiliationRepository,
  PostgresUserAffiliationRepository,
} from "./user-affiliation-repository/index.user-affiliation-repository.js";
import type { IUserRepository } from "./user-repository/user-repository.interface.js";
import type { IUserSessionRepository } from "./user-session-repository/user-session-repository.interface.js";
import type { IOrganisationalUnitRepository } from "./organisational-unit-repository/organisational-unit-repository.interface.js";
import type { IDesignationRepository } from "./designation-repository/designation-repository.interface.js";
import type { IUserAffiliationRepository } from "./user-affiliation-repository/user-affiliation-repository.interface.js";
import type { UserCredentialRecord } from "../lib/types/user/user.type.js";
import type { UserSessionRecord } from "../lib/types/user-session/user-session.type.js";

export interface RepositoryRegistry {
  userRepository: IUserRepository;
  userSessionRepository: IUserSessionRepository;
  organisationalUnitRepository: IOrganisationalUnitRepository;
  designationRepository: IDesignationRepository;
  userAffiliationRepository: IUserAffiliationRepository;
}

export interface InMemoryRepositoryRegistry extends RepositoryRegistry {
  organisationStore: InMemoryOrganisationStore;
  userRepository: InMemoryUserRepository;
  userSessionRepository: InMemoryUserSessionRepository;
  organisationalUnitRepository: InMemoryOrganisationalUnitRepository;
  designationRepository: InMemoryDesignationRepository;
  userAffiliationRepository: InMemoryUserAffiliationRepository;
}

export interface InMemoryRepositorySeed {
  users?: UserCredentialRecord[];
  userSessions?: UserSessionRecord[];
}

export function createPostgresRepositoryRegistry(): RepositoryRegistry {
  return {
    userRepository: new PostgresUserRepository(),
    userSessionRepository: new PostgresUserSessionRepository(),
    organisationalUnitRepository: new PostgresOrganisationalUnitRepository(),
    designationRepository: new PostgresDesignationRepository(),
    userAffiliationRepository: new PostgresUserAffiliationRepository(),
  };
}

export function createInMemoryRepositoryRegistry(seed: InMemoryRepositorySeed = {}): InMemoryRepositoryRegistry {
  const organisationStore = new InMemoryOrganisationStore();
  const userRepository = new InMemoryUserRepository({ users: seed.users, organisationStore });
  return {
    organisationStore,
    userRepository,
    userSessionRepository: new InMemoryUserSessionRepository({ sessions: seed.userSessions }),
    organisationalUnitRepository: new InMemoryOrganisationalUnitRepository(organisationStore),
    designationRepository: new InMemoryDesignationRepository(organisationStore),
    userAffiliationRepository: new InMemoryUserAffiliationRepository({ store: organisationStore, userRepository }),
  };
}

export function createRepositoryRegistry(backend: RepositoryBackend): RepositoryRegistry {
  if (backend === RepositoryBackend.POSTGRES) return createPostgresRepositoryRegistry();
  if (backend === RepositoryBackend.MEMORY) return createInMemoryRepositoryRegistry();
  throw new ConfigurationError(`Unknown repository backend '${String(backend)}'`);
}
