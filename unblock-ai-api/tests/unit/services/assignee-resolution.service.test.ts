import test from "node:test";
import assert from "node:assert/strict";
import { AssigneeResolutionService } from "../../../src/services/assignee-resolution.service.js";
import { RequesterProfileService } from "../../../src/services/requester-profile.service.js";
import { createAssigneeResolverRegistry } from "../../../src/services/assignee-resolution/index.assignee-resolver.js";
import { AssigneeResolutionNote, AssigneeSource } from "../../../src/data/constants/assignee.constant.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import { createSeedWorld } from "../../helpers/seed-world.helper.js";
import type { DesignationHolderLookup } from "../../../src/services/assignee-resolution/index.assignee-resolver.js";

test("for the IT fixture and Kavindu: the advisor is requester-supplied, Dinesh is HoD and Sunethra is Dean", async () => {
  const world = await createSeedWorld();
  const profile = await new RequesterProfileService(world.repositories).getProfile(world.userIdOf("Kavindu Jayawardena"));
  const service = new AssigneeResolutionService({
    registry: createAssigneeResolverRegistry({ holderLookup: world.repositories.userAffiliationRepository }),
  });

  const resolutions = await service.resolveAll(loadExpectedFixture("it_faculty_overseas_leave.json"), profile, world.catalogue);
  const byStep = new Map(resolutions.map((resolution) => [resolution.step_id, resolution.assignee]));

  assert.equal(byStep.get("advisor_review")?.source, AssigneeSource.REQUESTER_SUPPLIED);
  assert.equal(byStep.get("advisor_review")?.note, AssigneeResolutionNote.NOT_A_DESIGNATION);
  assert.equal(byStep.get("advisor_review")?.field_id, "assignees.advisor_review");
  assert.equal(byStep.get("hod_review")?.full_name, "Dinesh Wijesinghe");
  assert.equal(byStep.get("dean_review")?.full_name, "Sunethra Ratnayake");
});

test("steps sharing an approver cost one directory lookup and keep their own ids", async () => {
  const world = await createSeedWorld();
  const profile = await new RequesterProfileService(world.repositories).getProfile(world.userIdOf("Nuwan Perera"));
  let calls = 0;
  const holderLookup: DesignationHolderLookup = {
    findDesignationHolders: (designationId, unitIds) => {
      calls += 1;
      return world.repositories.userAffiliationRepository.findDesignationHolders(designationId, unitIds);
    },
  };
  const service = new AssigneeResolutionService({ registry: createAssigneeResolverRegistry({ holderLookup }) });
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  workflow.scope.applies_to.organisational_unit_codes = [];
  const hod = workflow.steps.find((step) => step.id === "hod_review")!;
  workflow.steps = [hod, { ...hod, id: "hod_second_look", depends_on: [{ step_id: "hod_review", required_outcome: "approved" }] }];

  const resolutions = await service.resolveAll(workflow, profile, world.catalogue);

  assert.equal(calls, 1);
  assert.deepEqual(resolutions.map((resolution) => resolution.step_id), ["hod_review", "hod_second_look"]);
  assert.deepEqual(resolutions.map((resolution) => resolution.assignee.field_id), ["assignees.hod_review", "assignees.hod_second_look"]);
  assert.ok(resolutions.every((resolution) => resolution.assignee.source === AssigneeSource.REQUESTER_CHOICE));
});

test("requester and system actors resolve without a directory lookup", async () => {
  const world = await createSeedWorld();
  const profile = await new RequesterProfileService(world.repositories).getProfile(world.userIdOf("Kavindu Jayawardena"));
  const service = new AssigneeResolutionService({
    registry: createAssigneeResolverRegistry({
      holderLookup: { findDesignationHolders: () => Promise.reject(new Error("unexpected lookup")) },
    }),
  });
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  const base = workflow.steps[0]!;
  workflow.steps = [
    { ...base, id: "self", assignee: { ...base.assignee, resolution: "requester", role: null, fallback_role: null } },
    { ...base, id: "auto", assignee: { ...base.assignee, resolution: "system", role: null, fallback_role: null } },
  ];

  const [self, auto] = await service.resolveAll(workflow, profile, world.catalogue);

  assert.equal(self?.assignee.source, AssigneeSource.REQUESTER);
  assert.equal(self?.assignee.email, "u17@u.c");
  assert.equal(auto?.assignee.source, AssigneeSource.SYSTEM);
});
