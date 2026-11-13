import test from "node:test";
import assert from "node:assert/strict";
import { RequesterProfileService } from "../../../src/services/requester-profile.service.js";
import { UserErrorCode } from "../../../src/data/constants/user-error.constant.js";
import { RequesterProfileFactKind } from "../../../src/data/constants/requester.constant.js";
import { withErrorCode } from "../../helpers/error-assertion.helper.js";
import { createSeedWorld } from "../../helpers/seed-world.helper.js";

test("getProfile builds the requester profile from the directory", async () => {
  const world = await createSeedWorld();
  const service = new RequesterProfileService(world.repositories);

  const profile = await service.getProfile(world.userIdOf("Kavindu Jayawardena"));

  assert.equal(profile.fullName, "Kavindu Jayawardena");
  assert.equal(profile.email, "u17@u.c");
  assert.deepEqual(profile.actorTypes, ["student"]);
  assert.deepEqual(profile.effectiveFaculties.map((faculty) => faculty.code), ["FIT"]);
  assert.deepEqual(
    profile.facts.map((fact) => [fact.id, fact.kind, fact.unit.code]),
    [
      ["P1", RequesterProfileFactKind.MEMBER_OF_UNIT, "FIT"],
      ["P2", RequesterProfileFactKind.MEMBER_OF_UNIT, "IT"],
      ["P3", RequesterProfileFactKind.HOLDS_DESIGNATION, "IT"],
    ],
  );
});

test("getProfile throws for an unknown user", async () => {
  const world = await createSeedWorld();
  const service = new RequesterProfileService(world.repositories);

  await assert.rejects(service.getProfile("missing-user"), withErrorCode(UserErrorCode.USER_NOT_FOUND));
});
