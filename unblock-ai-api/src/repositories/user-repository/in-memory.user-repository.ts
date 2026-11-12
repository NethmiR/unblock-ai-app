import { randomUUID } from "node:crypto";
import { ConflictError } from "../../errors/conflict.error.js";
import { ValidationError } from "../../errors/validation.error.js";
import { UserErrorCode } from "../../data/constants/user-error.constant.js";
import { UserStatus } from "../../data/constants/user.constant.js";
import { InMemoryOrganisationStore } from "../in-memory-organisation-store.js";
import { compareText } from "../../utils/shared/text.util.js";
import type { IUserRepository } from "./user-repository.interface.js";
import type {
  CreateUserRecordInput,
  UserCredentialRecord,
  UserListFilter,
  UserListPage,
  UserRecord,
  UserReference,
} from "../../lib/types/user/user.type.js";

export interface InMemoryUserRepositoryOptions {
  users?: UserCredentialRecord[];
  organisationStore?: InMemoryOrganisationStore;
}

function copyCredential(record: UserCredentialRecord): UserCredentialRecord {
  return { ...record, permissions: [...record.permissions].sort() };
}

function toUserRecord(record: UserCredentialRecord): UserRecord {
  const { passwordHash: _passwordHash, ...user } = copyCredential(record);
  return user;
}

export class InMemoryUserRepository implements IUserRepository {
  private readonly users = new Map<string, UserCredentialRecord>();
  private readonly organisationStore: InMemoryOrganisationStore;

  constructor({ users = [], organisationStore = new InMemoryOrganisationStore() }: InMemoryUserRepositoryOptions = {}) {
    for (const user of users) this.users.set(user.id, copyCredential(user));
    this.organisationStore = organisationStore;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = this.users.get(id);
    return user ? toUserRecord(user) : null;
  }

  async findReferencesByIds(ids: readonly string[]): Promise<UserReference[]> {
    return ids.flatMap((id) => {
      const user = this.users.get(id);
      return user ? [{ id: user.id, fullName: user.fullName, email: user.email }] : [];
    });
  }

  async findCredentialByEmail(email: string): Promise<UserCredentialRecord | null> {
    const user = this.findByEmail(email);
    return user ? copyCredential(user) : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    return this.findByEmail(email) !== undefined;
  }

  async list(filter: UserListFilter): Promise<UserListPage> {
    const search = filter.search?.toLowerCase() ?? null;
    const unitId = filter.organisationalUnitId;
    const matching = [...this.users.values()]
      .filter(
        (user) =>
          search === null || user.fullName.toLowerCase().includes(search) || user.email.toLowerCase().includes(search),
      )
      .filter((user) => unitId === null || this.organisationStore.isMemberOfUnitOrItsChildren(user.id, unitId))
      .sort((a, b) => compareText(a.fullName, b.fullName) || a.id.localeCompare(b.id));

    return {
      users: matching.slice(filter.offset, filter.offset + filter.limit).map(toUserRecord),
      total: matching.length,
    };
  }

  async create(input: CreateUserRecordInput): Promise<UserRecord> {
    if (input.permissions.length === 0) {
      throw new ValidationError("A user must hold at least one permission");
    }
    if (this.findByEmail(input.email)) {
      throw new ConflictError(`A user with email '${input.email}' already exists`, {
        code: UserErrorCode.EMAIL_ALREADY_REGISTERED,
      });
    }

    const now = new Date();
    const user: UserCredentialRecord = {
      id: randomUUID(),
      email: input.email,
      fullName: input.fullName,
      passwordHash: input.passwordHash,
      status: UserStatus.ACTIVE,
      permissions: [...input.permissions],
      failedLoginCount: 0,
      lastFailedLoginAt: null,
      lastLoginAt: null,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return toUserRecord(user);
  }

  async recordSuccessfulLogin(id: string, at: Date): Promise<void> {
    const user = this.users.get(id);
    if (!user) return;
    user.lastLoginAt = at;
    user.failedLoginCount = 0;
    user.lastFailedLoginAt = null;
    user.updatedAt = at;
  }

  async recordFailedLogin(id: string, at: Date, failureWindowStart: Date): Promise<number> {
    const user = this.users.get(id);
    if (!user) return 0;
    const windowExpired = user.lastFailedLoginAt === null || user.lastFailedLoginAt < failureWindowStart;
    user.failedLoginCount = windowExpired ? 1 : user.failedLoginCount + 1;
    user.lastFailedLoginAt = at;
    user.updatedAt = at;
    return user.failedLoginCount;
  }

  private findByEmail(email: string): UserCredentialRecord | undefined {
    const target = email.toLowerCase();
    return [...this.users.values()].find((user) => user.email.toLowerCase() === target);
  }
}
