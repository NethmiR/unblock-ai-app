import test from "node:test";
import assert from "node:assert/strict";
import { UserService } from "../../../src/services/user.service.js";
import { createInMemoryRepositoryRegistry } from "../../../src/repositories/repository-registry.factory.js";
import type { InMemoryUserRepository } from "../../../src/repositories/user-repository/in-memory.user-repository.js";
import { createOrganisationWorld } from "../../helpers/organisation-world.helper.js";
import { verifyPassword } from "../../../src/utils/shared/password.util.js";
import { Permission } from "../../../src/data/constants/permission.constant.js";
import { UserStatus, USER_FIELD_LIMIT, USER_LIST_PAGINATION } from "../../../src/data/constants/user.constant.js";
import { UserErrorCode } from "../../../src/data/constants/user-error.constant.js";
import { ValidationError } from "../../../src/errors/validation.error.js";
import { ConflictError } from "../../../src/errors/conflict.error.js";
import { NotFoundError } from "../../../src/errors/not-found.error.js";
import type { CreateUserInput, UserListFilter } from "../../../src/lib/types/user/user.type.js";

const DEFAULT_PASSWORD = "12345";
const CREATOR_ID = "00000000-0000-4000-8000-000000000001";

function build(): { service: UserService; repository: InMemoryUserRepository } {
  const { userRepository, userAffiliationRepository } = createInMemoryRepositoryRegistry();
  const service = new UserService({
    userRepository,
    userAffiliationRepository,
    userConfig: { defaultPassword: DEFAULT_PASSWORD },
  });
  return { service, repository: userRepository };
}

function listFilter(overrides: Partial<UserListFilter> = {}): UserListFilter {
  return { search: null, organisationalUnitId: null, limit: USER_LIST_PAGINATION.DEFAULT_LIMIT, offset: 0, ...overrides };
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
  const result = await service.listUsers(listFilter());
  assert.equal(result.total, 2);
  assert.equal(result.limit, USER_LIST_PAGINATION.DEFAULT_LIMIT);
  assert.equal(result.offset, 0);
});

test("listUsers attaches each user's organisational units", async () => {
  const world = await createOrganisationWorld();
  const { userRepository, userAffiliationRepository } = world.repositories;
  const service = new UserService({ userRepository, userAffiliationRepository, userConfig: { defaultPassword: DEFAULT_PASSWORD } });
  await userAffiliationRepository.replaceForUser(
    world.firstStaffMember.id,
    [{ organisationalUnitId: world.engineering.id, designationIds: [] }, { organisationalUnitId: world.computerScience.id, designationIds: [] }],
    world.administrator.id,
  );

  const result = await service.listUsers(listFilter({ search: "  amara  " }));
  assert.deepEqual(
    result.users.map((user) => [user.email, user.organisationalUnits.map((unit) => unit.code)]),
    [["amara@uom.lk", ["FOE", "CSE"]]],
  );
});

test("listUsers treats a blank search as no search and rejects out-of-range paging", async () => {
  const { service } = build();
  await service.createUser(input(), null);
  assert.equal((await service.listUsers(listFilter({ search: "   " }))).total, 1);

  for (const filter of [
    listFilter({ limit: 0 }),
    listFilter({ limit: USER_LIST_PAGINATION.MAX_LIMIT + 1 }),
    listFilter({ offset: -1 }),
    listFilter({ search: "x".repeat(USER_LIST_PAGINATION.SEARCH_MAX_LENGTH + 1) }),
  ]) {
    await assert.rejects(service.listUsers(filter), ValidationError);
  }
});
