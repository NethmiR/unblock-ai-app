import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryUserRepository } from "../../../src/repositories/user-repository/in-memory.user-repository.js";
import { Permission } from "../../../src/data/constants/permission.constant.js";
import { UserStatus } from "../../../src/data/constants/user.constant.js";
import { UserErrorCode } from "../../../src/data/constants/user-error.constant.js";
import { ConflictError } from "../../../src/errors/conflict.error.js";
import { ValidationError } from "../../../src/errors/validation.error.js";
import { OrganisationalUnitType } from "../../../src/data/constants/organisational-unit.constant.js";
import { USER_LIST_PAGINATION } from "../../../src/data/constants/user.constant.js";
import { createInMemoryRepositoryRegistry } from "../../../src/repositories/repository-registry.factory.js";
import type { CreateUserRecordInput, UserListFilter } from "../../../src/lib/types/user/user.type.js";

function listFilter(overrides: Partial<UserListFilter> = {}): UserListFilter {
  return { search: null, organisationalUnitId: null, limit: USER_LIST_PAGINATION.MAX_LIMIT, offset: 0, ...overrides };
}

function input(overrides: Partial<CreateUserRecordInput> = {}): CreateUserRecordInput {
  return {
    email: "jane@example.com",
    fullName: "Jane Doe",
    passwordHash: "hash",
    permissions: [Permission.TASK_CREATE, Permission.WORKFLOW_MANAGE],
    createdByUserId: null,
    ...overrides,
  };
}

test("create returns an active user with sorted permissions and no password hash", async () => {
  const repository = new InMemoryUserRepository();
  const user = await repository.create(input());

  assert.equal(user.status, UserStatus.ACTIVE);
  assert.deepEqual(user.permissions, [Permission.TASK_CREATE, Permission.WORKFLOW_MANAGE]);
  assert.equal("passwordHash" in user, false);
  assert.deepEqual(await repository.findById(user.id), user);
});

test("findCredentialByEmail matches case-insensitively and includes the hash", async () => {
  const repository = new InMemoryUserRepository();
  await repository.create(input());

  const credential = await repository.findCredentialByEmail("JANE@example.com");
  assert.equal(credential?.passwordHash, "hash");
  assert.equal(await repository.existsByEmail("Jane@Example.com"), true);
  assert.equal(await repository.existsByEmail("other@example.com"), false);
});

test("create rejects a duplicate email with EMAIL_ALREADY_REGISTERED", async () => {
  const repository = new InMemoryUserRepository();
  await repository.create(input());

  await assert.rejects(
    repository.create(input({ email: "JANE@EXAMPLE.COM" })),
    (err: unknown) => err instanceof ConflictError && err.code === UserErrorCode.EMAIL_ALREADY_REGISTERED,
  );
});

test("create rejects an empty permission list", async () => {
  const repository = new InMemoryUserRepository();
  await assert.rejects(repository.create(input({ permissions: [] })), ValidationError);
});

test("list orders by full name case-insensitively", async () => {
  const repository = new InMemoryUserRepository();
  await repository.create(input({ email: "c@example.com", fullName: "charlie" }));
  await repository.create(input({ email: "a@example.com", fullName: "Alice" }));
  await repository.create(input({ email: "b@example.com", fullName: "Bob" }));

  const page = await repository.list(listFilter());
  assert.deepEqual(
    page.users.map((user) => user.fullName),
    ["Alice", "Bob", "charlie"],
  );
  assert.equal(page.total, 3);
});

test("list searches full name and email case-insensitively", async () => {
  const repository = new InMemoryUserRepository();
  await repository.create(input({ email: "kamal@uom.lk", fullName: "Kamal Perera" }));
  await repository.create(input({ email: "nimal@uom.lk", fullName: "Nimal Silva" }));

  assert.deepEqual((await repository.list(listFilter({ search: "PERERA" }))).users.map((user) => user.email), ["kamal@uom.lk"]);
  assert.deepEqual((await repository.list(listFilter({ search: "nimal@" }))).users.map((user) => user.email), ["nimal@uom.lk"]);
});

test("list paginates while reporting the full total", async () => {
  const repository = new InMemoryUserRepository();
  for (const name of ["Alice", "Bob", "Charlie", "Dinuka"]) {
    await repository.create(input({ email: `${name.toLowerCase()}@example.com`, fullName: name }));
  }

  const page = await repository.list(listFilter({ limit: 2, offset: 2 }));
  assert.deepEqual(
    page.users.map((user) => user.fullName),
    ["Charlie", "Dinuka"],
  );
  assert.equal(page.total, 4);
});

test("list filters by organisational unit, including members of its child units", async () => {
  const { userRepository, organisationalUnitRepository, userAffiliationRepository } = createInMemoryRepositoryRegistry();
  const faculty = await organisationalUnitRepository.create({
    code: "FOE",
    name: "Faculty of Engineering",
    unitType: OrganisationalUnitType.FACULTY,
    parent: null,
    description: null,
    createdByUserId: null,
  });
  const department = await organisationalUnitRepository.create({
    code: "CSE",
    name: "Department of Computer Science & Engineering",
    unitType: OrganisationalUnitType.DEPARTMENT,
    parent: { id: faculty.id, unitType: faculty.unitType },
    description: null,
    createdByUserId: null,
  });
  const lecturer = await userRepository.create(input({ email: "lecturer@uom.lk", fullName: "Lecturer" }));
  await userRepository.create(input({ email: "outsider@uom.lk", fullName: "Outsider" }));
  await userAffiliationRepository.replaceForUser(
    lecturer.id,
    [{ organisationalUnitId: faculty.id, designationIds: [] }, { organisationalUnitId: department.id, designationIds: [] }],
    lecturer.id,
  );

  for (const unitId of [faculty.id, department.id]) {
    const page = await userRepository.list(listFilter({ organisationalUnitId: unitId }));
    assert.deepEqual(
      page.users.map((user) => user.email),
      ["lecturer@uom.lk"],
    );
  }
});

test("recordFailedLogin counts within the window and restarts once it has passed", async () => {
  const repository = new InMemoryUserRepository();
  const user = await repository.create(input());
  const t0 = new Date("2026-01-01T10:00:00Z");
  const t1 = new Date("2026-01-01T10:01:00Z");
  const t2 = new Date("2026-01-01T11:00:00Z");

  assert.equal(await repository.recordFailedLogin(user.id, t0, new Date(t0.getTime() - 60_000)), 1);
  assert.equal(await repository.recordFailedLogin(user.id, t1, new Date(t1.getTime() - 15 * 60_000)), 2);
  assert.equal(await repository.recordFailedLogin(user.id, t2, new Date(t2.getTime() - 15 * 60_000)), 1);
});

test("recordSuccessfulLogin resets failure bookkeeping", async () => {
  const repository = new InMemoryUserRepository();
  const user = await repository.create(input());
  const at = new Date();
  await repository.recordFailedLogin(user.id, at, new Date(0));
  await repository.recordSuccessfulLogin(user.id, at);

  const updated = await repository.findById(user.id);
  assert.equal(updated?.failedLoginCount, 0);
  assert.equal(updated?.lastFailedLoginAt, null);
  assert.deepEqual(updated?.lastLoginAt, at);
});
