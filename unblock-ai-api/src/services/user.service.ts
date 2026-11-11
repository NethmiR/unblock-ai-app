import { hashPassword } from "../utils/shared/password.util.js";
import { isValidEmail, normalizeEmail } from "../utils/user/email.util.js";
import { isPermission } from "../utils/auth/permission.util.js";
import { ValidationError } from "../errors/validation.error.js";
import { NotFoundError } from "../errors/not-found.error.js";
import { USER_FIELD_LIMIT } from "../data/constants/user.constant.js";
import { UserErrorCode } from "../data/constants/user-error.constant.js";
import type { Permission } from "../data/constants/permission.constant.js";
import type { IUserRepository } from "../repositories/user-repository/user-repository.interface.js";
import type { UserConfig } from "../lib/types/config/config.type.js";
import type { CreateUserInput, UserRecord } from "../lib/types/user/user.type.js";

export interface UserServiceOptions {
  userRepository: IUserRepository;
  userConfig: UserConfig;
}

export class UserService {
  private readonly userRepository: IUserRepository;
  private readonly userConfig: UserConfig;

  constructor({ userRepository, userConfig }: UserServiceOptions) {
    this.userRepository = userRepository;
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

  listUsers(): Promise<UserRecord[]> {
    return this.userRepository.list();
  }

  async getUserById(id: string): Promise<UserRecord> {
    const user = await this.userRepository.findById(id);
    if (!user) throw new NotFoundError(`User '${id}' not found`, { code: UserErrorCode.USER_NOT_FOUND });
    return user;
  }

  existsByEmail(email: string): Promise<boolean> {
    return this.userRepository.existsByEmail(normalizeEmail(email));
  }
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
