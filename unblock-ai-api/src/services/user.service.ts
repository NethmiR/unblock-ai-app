import { hashPassword } from "../utils/shared/password.util.js";
import { isValidEmail, normalizeEmail } from "../utils/user/email.util.js";
import { isPermission } from "../utils/auth/permission.util.js";
import { normalizeOptionalText } from "../utils/shared/text.util.js";
import { requireIntegerInRange, requireOptionalTextLength } from "../utils/shared/field-validation.util.js";
import { ValidationError } from "../errors/validation.error.js";
import { userNotFound } from "../errors/user.error.js";
import { USER_FIELD_LIMIT, USER_LIST_PAGINATION } from "../data/constants/user.constant.js";
import type { Permission } from "../data/constants/permission.constant.js";
import type { IUserRepository } from "../repositories/user-repository/user-repository.interface.js";
import type { IUserAffiliationRepository } from "../repositories/user-affiliation-repository/user-affiliation-repository.interface.js";
import type { UserConfig } from "../lib/types/config/config.type.js";
import type { CreateUserInput, UserListFilter, UserListResult, UserRecord } from "../lib/types/user/user.type.js";

export interface UserServiceOptions {
  userRepository: IUserRepository;
  userAffiliationRepository: IUserAffiliationRepository;
  userConfig: UserConfig;
}

export class UserService {
  private readonly userRepository: IUserRepository;
  private readonly userAffiliationRepository: IUserAffiliationRepository;
  private readonly userConfig: UserConfig;

  constructor({ userRepository, userAffiliationRepository, userConfig }: UserServiceOptions) {
    this.userRepository = userRepository;
    this.userAffiliationRepository = userAffiliationRepository;
    this.userConfig = userConfig;
  }

  async createUser(input: CreateUserInput, createdByUserId: string | null): Promise<UserRecord> {
    const email = validateEmail(input.email);
    const fullName = validateFullName(input.fullName);
    const permissions = validatePermissions(input.permissions);

    return this.userRepository.create({
      email,
      fullName,
      permissions,
      passwordHash: await hashPassword(this.userConfig.defaultPassword),
      createdByUserId,
    });
  }

  async listUsers(filter: UserListFilter): Promise<UserListResult> {
    const validated = validateListFilter(filter);
    const page = await this.userRepository.list(validated);
    const unitsByUser = await this.userAffiliationRepository.findUnitSummariesByUserIds(page.users.map((user) => user.id));
    return {
      users: page.users.map((user) => ({ ...user, organisationalUnits: unitsByUser.get(user.id) ?? [] })),
      total: page.total,
      limit: validated.limit,
      offset: validated.offset,
    };
  }

  async getUserById(id: string): Promise<UserRecord> {
    const user = await this.userRepository.findById(id);
    if (!user) throw userNotFound(id);
    return user;
  }

  existsByEmail(email: string): Promise<boolean> {
    return this.userRepository.existsByEmail(normalizeEmail(email));
  }
}

function validateListFilter(filter: UserListFilter): UserListFilter {
  return {
    search: requireOptionalTextLength(normalizeOptionalText(filter.search), "search", USER_LIST_PAGINATION.SEARCH_MAX_LENGTH),
    organisationalUnitId: filter.organisationalUnitId,
    limit: requireIntegerInRange(filter.limit, "limit", 1, USER_LIST_PAGINATION.MAX_LIMIT),
    offset: requireIntegerInRange(filter.offset, "offset", 0, Number.MAX_SAFE_INTEGER),
  };
}

function validateEmail(raw: string): string {
  const email = normalizeEmail(raw);
  if (!isValidEmail(email)) {
    throw new ValidationError(
      `email must be a valid address of at most ${USER_FIELD_LIMIT.EMAIL_MAX_LENGTH} characters`,
    );
  }
  return email;
}

function validateFullName(raw: string): string {
  const fullName = raw.trim();
  if (fullName.length === 0 || fullName.length > USER_FIELD_LIMIT.FULL_NAME_MAX_LENGTH) {
    throw new ValidationError(
      `full_name must contain between 1 and ${USER_FIELD_LIMIT.FULL_NAME_MAX_LENGTH} characters`,
    );
  }
  return fullName;
}

function validatePermissions(raw: readonly string[]): Permission[] {
  if (raw.length === 0) {
    throw new ValidationError("permissions must contain at least one permission");
  }

  const unknown = raw.filter((value) => !isPermission(value));
  if (unknown.length > 0) {
    throw new ValidationError(`permissions contains unknown values: ${unknown.join(", ")}`);
  }

  if (new Set(raw).size !== raw.length) {
    throw new ValidationError("permissions must not contain duplicates");
  }

  return raw.filter(isPermission);
}
