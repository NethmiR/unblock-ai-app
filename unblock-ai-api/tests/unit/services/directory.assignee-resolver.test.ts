import test from "node:test";
import assert from "node:assert/strict";
import { DirectoryAssigneeResolver } from "../../../src/services/assignee-resolution/directory.assignee-resolver.js";
import { RequesterProfileService } from "../../../src/services/requester-profile.service.js";
import { AssigneeResolutionNote, AssigneeSource } from "../../../src/data/constants/assignee.constant.js";
import { createSeedWorld, sampleUsersWithout, type SeedWorld } from "../../helpers/seed-world.helper.js";
import type { AssigneeResolution } from "../../../src/lib/types/assignee/assignee-resolver.type.js";
import type { WorkflowTemplateAudience } from "../../../src/lib/types/selection/eligibility.type.js";
import type { Actor, ActorResolution } from "../../../src/lib/types/workflow/actor.type.js";

const OPEN: WorkflowTemplateAudience = { actorType: "any", organisationalUnitCodes: [] };
const FIT: WorkflowTemplateAudience = { actorType: "any", organisationalUnitCodes: ["FIT"] };

function actor(role: string, resolution: ActorResolution = "dynamic", fallbackRole: string | null = null): Actor {
  return { resolution, role, relative_to: "requester", directory_query: null, fallback_role: fallbackRole, display_name: null };
}

async function resolve(
  world: SeedWorld,
  requester: string,
  stepActor: Actor,
  audience: WorkflowTemplateAudience = OPEN,
): Promise<AssigneeResolution> {
  const profile = await new RequesterProfileService(world.repositories).getProfile(world.userIdOf(requester));
  const resolver = new DirectoryAssigneeResolver({ holderLookup: world.repositories.userAffiliationRepository });
  return resolver.resolve({ actor: stepActor, stepId: "approval", profile, audience, catalogue: world.catalogue });
}

test("an IT student resolves the IT head of department and the FIT dean", async () => {
  const world = await createSeedWorld();

  const hod = await resolve(world, "Kavindu Jayawardena", actor("head_of_department"), FIT);
  const dean = await resolve(world, "Kavindu Jayawardena", actor("dean"), FIT);

  assert.equal(hod.assignee.source, AssigneeSource.DIRECTORY);
  assert.equal(hod.assignee.full_name, "Dinesh Wijesinghe");
  assert.equal(hod.assignee.designation_title, "Head of Department");
  assert.equal(hod.assignee.organisational_unit_name, "Department of Information Technology");
  assert.equal(hod.assignee.field_id, null);
  assert.equal(dean.assignee.full_name, "Sunethra Ratnayake");
  assert.equal(dean.assignee.email, "u18@u.c");
});

test("a role that is not a designation is supplied by the requester and ignores the fallback", async () => {
  const world = await createSeedWorld();

  const advisor = await resolve(world, "Kavindu Jayawardena", actor("academic_advisor", "dynamic", "head_of_department"));

  assert.equal(advisor.assignee.source, AssigneeSource.REQUESTER_SUPPLIED);
  assert.equal(advisor.assignee.note, AssigneeResolutionNote.NOT_A_DESIGNATION);
  assert.equal(advisor.assignee.field_id, "assignees.approval");
  assert.equal(advisor.assignee.full_name, null);
});

test("a vacant head of department falls back to the dean", async () => {
  const world = await createSeedWorld({ users: sampleUsersWithout("Dinesh Wijesinghe") });

  const resolution = await resolve(world, "Kavindu Jayawardena", actor("head_of_department", "dynamic", "dean"), FIT);

  assert.equal(resolution.assignee.source, AssigneeSource.DIRECTORY);
  assert.equal(resolution.assignee.full_name, "Sunethra Ratnayake");
  assert.equal(resolution.assignee.note, AssigneeResolutionNote.RESOLVED_BY_FALLBACK);
});

test("a vacant post with no fallback is supplied by the requester", async () => {
  const world = await createSeedWorld({ users: sampleUsersWithout("Dinesh Wijesinghe") });

  const resolution = await resolve(world, "Kavindu Jayawardena", actor("head_of_department"), FIT);

  assert.equal(resolution.assignee.source, AssigneeSource.REQUESTER_SUPPLIED);
  assert.equal(resolution.assignee.note, AssigneeResolutionNote.NO_HOLDER);
});

test("the CSE and IT dual member chooses between both heads with an open audience", async () => {
  const world = await createSeedWorld();

  const resolution = await resolve(world, "Nuwan Perera", actor("head_of_department"));

  assert.equal(resolution.assignee.source, AssigneeSource.REQUESTER_CHOICE);
  assert.equal(resolution.assignee.note, AssigneeResolutionNote.MULTIPLE_HOLDERS);
  assert.equal(resolution.assignee.field_id, "assignees.approval");
  assert.deepEqual(resolution.options.map((option) => option.label), ["Chamari Gunawardena", "Dinesh Wijesinghe"]);
  assert.deepEqual(resolution.options.map((option) => option.value), [world.userIdOf("Chamari Gunawardena"), world.userIdOf("Dinesh Wijesinghe")]);
  assert.match(resolution.options[1]!.description ?? "", /Head of Department · Department of Information Technology/);
  assert.deepEqual(resolution.assignee.candidates.map((candidate) => candidate.email), ["u4@u.c", "u19@u.c"]);
});

test("the dual member with audience FIT gets only the IT head", async () => {
  const world = await createSeedWorld();

  const resolution = await resolve(world, "Nuwan Perera", actor("head_of_department"), FIT);

  assert.equal(resolution.assignee.source, AssigneeSource.DIRECTORY);
  assert.equal(resolution.assignee.full_name, "Dinesh Wijesinghe");
});

test("a requester who holds the designation is skipped", async () => {
  const world = await createSeedWorld();

  const resolution = await resolve(world, "Dinesh Wijesinghe", actor("head_of_department"), FIT);

  assert.equal(resolution.assignee.source, AssigneeSource.REQUESTER_SUPPLIED);
  assert.equal(resolution.assignee.note, AssigneeResolutionNote.HOLDER_IS_REQUESTER);
});

test("a requester who holds the designation is skipped in favour of the fallback", async () => {
  const world = await createSeedWorld();

  const resolution = await resolve(world, "Dinesh Wijesinghe", actor("head_of_department", "dynamic", "dean"), FIT);

  assert.equal(resolution.assignee.full_name, "Sunethra Ratnayake");
  assert.equal(resolution.assignee.note, AssigneeResolutionNote.RESOLVED_BY_FALLBACK);
});

test("the registrar resolves institution-wide for a static actor", async () => {
  const world = await createSeedWorld();

  const resolution = await resolve(world, "Kavindu Jayawardena", actor("registrar", "static"), FIT);

  assert.equal(resolution.assignee.source, AssigneeSource.DIRECTORY);
  assert.equal(resolution.assignee.full_name, "Dilrukshi Fernando");
});
