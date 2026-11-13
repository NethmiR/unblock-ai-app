import test from "node:test";
import assert from "node:assert/strict";
import { RequesterAttribute } from "../../../src/data/constants/requester.constant.js";
import { matchRequesterAttribute } from "../../../src/utils/requester/requester-attribute-input.util.js";
import type { Actor, ActorResolution } from "../../../src/lib/types/workflow/actor.type.js";
import type { InputType, WorkflowInput } from "../../../src/lib/types/workflow/workflow.type.js";

function actor(resolution: ActorResolution): Actor {
  return { resolution, role: null, relative_to: null, directory_query: null, fallback_role: null, display_name: null };
}

function input(id: string, type: InputType, resolution: ActorResolution = "requester"): WorkflowInput {
  return {
    id,
    label: id,
    description: null,
    type,
    collected_from: actor(resolution),
    required: true,
    validation: {
      min_length: null,
      max_length: null,
      min: null,
      max: null,
      not_before: null,
      not_after: null,
      not_before_field: null,
      not_after_field: null,
      pattern: null,
    },
    collection_hint: null,
  };
}

test("well-known legacy input ids map onto requester attributes", () => {
  assert.equal(matchRequesterAttribute(input("full_name", "string")), RequesterAttribute.FULL_NAME);
  assert.equal(matchRequesterAttribute(input("Student_Name", "string")), RequesterAttribute.FULL_NAME);
  assert.equal(matchRequesterAttribute(input("requester_email", "email")), RequesterAttribute.EMAIL);
  assert.equal(matchRequesterAttribute(input("faculty", "string")), RequesterAttribute.FACULTY);
  assert.equal(matchRequesterAttribute(input("department_name", "string")), RequesterAttribute.DEPARTMENT);
  assert.equal(matchRequesterAttribute(input("job_title", "string")), RequesterAttribute.DESIGNATIONS);
});

test("an email alias only matches an email-typed input", () => {
  assert.equal(matchRequesterAttribute(input("email", "string")), null);
  assert.equal(matchRequesterAttribute(input("contact_email", "email")), RequesterAttribute.EMAIL);
});

test("inputs that are not collected from the requester or are not aliases do not match", () => {
  assert.equal(matchRequesterAttribute(input("full_name", "string", "dynamic")), null);
  assert.equal(matchRequesterAttribute(input("index_number", "string")), null);
});
