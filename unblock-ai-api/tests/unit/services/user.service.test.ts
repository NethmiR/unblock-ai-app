import test from "node:test";
import assert from "node:assert/strict";
import { UserService } from "../../../src/services/user.service.js";
import { InMemoryUserRepository } from "../../../src/repositories/user-repository/in-memory.user-repository.js";
import { verifyPassword } from "../../../src/utils/shared/password.util.js";
import { Permission } from "../../../src/data/constants/permission.constant.js";
import { UserStatus, USER_FIELD_LIMIT } from "../../../src/data/constants/user.constant.js";
import { UserErrorCode } from "../../../src/data/constants/user-error.constant.js";
import { ValidationError } from "../../../src/errors/validation.error.js";
import { ConflictError } from "../../../src/errors/conflict.error.js";
import { NotFoundError } from "../../../src/errors/not-found.error.js";
import type { CreateUserInput } from "../../../src/lib/types/user/user.type.js";

const DEFAULT_PASSWORD = "12345";
const CREATOR_ID = "00000000-0000-4000-8000-000000000001";

function build(): { service: UserService; repository: InMemoryUserRepository } {
  const repository = new InMemoryUserRepository();
  const service = new UserService({ userRepository: repository, userConfig: { defaultPassword: DEFAULT_PASSWORD } });
  return { service, repository };
}

function input(overrides: Partial<CreateUserInput> = {}): CreateUserInput {
  return {
    email: "  Jane.Doe@Example.COM ",
    fullName: "  Jane Doe ",
    permissions: [Permission.TASK_CREATE],
    ...overrides,
  };
}

test("createUser normalises email and name, records the creator and returns an active user", async () => {
  const { service } = build();
  const user = await service.createUser(input(), CREATOR_ID);

  assert.equal(user.email, "jane.doe@example.com");
  assert.equal(user.fullName, "Jane Doe");
  assert.equal(user.status, UserStatus.ACTIVE);
  assert.deepEqual(user.permissions, [Permission.TASK_CREATE]);
  assert.equal(user.createdByUserId, CREATOR_ID);
});

test("createUser hashes the configured default password", async () => {
  const { service, repository } = build();
  await service.createUser(input(), null);

  const credential = await repository.findCredentialByEmail("jane.doe@example.com");
  assert.notEqual(credential?.passwordHash, DEFAULT_PASSWORD);
  assert.equal(await verifyPassword(DEFAULT_PASSWORD, credential!.passwordHash), true);
});

test("createUser rejects invalid emails", async () => {
  const { service } = build();
  for (const email of ["", "not-an-email", `${"a".repeat(USER_FIELD_LIMIT.EMAIL_MAX_LENGTH)}@example.com`]) {
    await assert.rejects(service.createUser(input({ email }), null), ValidationError, email);
  }
});

test("createUser rejects an empty or overlong full name", async () => {
  const { service } = build();
  await assert.rejects(service.createUser(input({ fullName: "   " }), null), ValidationError);
  await assert.rejects(
    service.createUser(input({ fullName: "x".repeat(USER_FIELD_LIMIT.FULL_NAME_MAX_LENGTH + 1) }), null),
    ValidationError,
  );
});

test("createUser rejects empty, unknown and duplicate permissions", async () => {
  const { service } = build();
  await assert.rejects(service.createUser(input({ permissions: [] }), null), ValidationError);
  await assert.rejects(service.createUser(input({ permissions: ["workflow:delete"] }), null), ValidationError);
  await assert.rejects(
    service.createUser(input({ permissions: [Permission.TASK_CREATE, Permission.TASK_CREATE] }), null),
    ValidationError,
  );
});

test("createUser rejects a duplicate email in any case with EMAIL_ALREADY_REGISTERED", async () => {
  const { service } = build();
  await service.createUser(input(), null);
  await assert.rejects(
    service.createUser(input({ email: "JANE.DOE@example.com" }), null),
    (err: unknown) => err instanceof ConflictError && err.code === UserErrorCode.EMAIL_ALREADY_REGISTERED,
  );
});

test("getUserById returns the user or throws USER_NOT_FOUND", async () => {
  const { service } = build();
  const user = await service.createUser(input(), null);

  assert.equal((await service.getUserById(user.id)).id, user.id);
  await assert.rejects(
    service.getUserById("00000000-0000-4000-8000-0000000000ff"),
    (err: unknown) => err instanceof NotFoundError && err.code === UserErrorCode.USER_NOT_FOUND,
  );
});

test("existsByEmail normalises before checking", async () => {
  const { service } = build();
  await service.createUser(input(), null);
  assert.equal(await service.existsByEmail(" JANE.DOE@EXAMPLE.COM "), true);
  assert.equal(await service.existsByEmail("other@example.com"), false);
});

test("listUsers returns every user", async () => {
  const { service } = build();
  await service.createUser(input(), null);
  await service.createUser(input({ email: "b@example.com", fullName: "Bob" }), null);
  assert.equal((await service.listUsers()).length, 2);
});
