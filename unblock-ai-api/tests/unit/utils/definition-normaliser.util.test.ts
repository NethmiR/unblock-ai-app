import test from "node:test";
import assert from "node:assert/strict";
import { normaliseWorkflowDefinition } from "../../../src/utils/workflow/definition-normaliser.util.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import type {
  StoredWorkflowDefinition,
  StoredWorkflowDefinitionInput,
} from "../../../src/lib/types/workflow-template/workflow-template.type.js";

function storedFixture(): StoredWorkflowDefinition {
  const { title: _title, ...definition } = loadExpectedFixture("it_faculty_overseas_leave.json");
  return definition;
}

test("a legacy definition without the new keys normalises to empty lists", () => {
  const current = storedFixture();
  const { organisational_unit_codes: _codes, ...legacyAppliesTo } = current.scope.applies_to;
  const legacy: StoredWorkflowDefinitionInput = {
    ...current,
    scope: { ...current.scope, applies_to: legacyAppliesTo },
    steps: current.steps.map(({ collects_inputs: _collects, ...step }) => step),
  };

  const normalised = normaliseWorkflowDefinition(legacy);

  assert.deepEqual(normalised.scope.applies_to.organisational_unit_codes, []);
  assert.ok(normalised.steps.every((step) => step.collects_inputs.length === 0));
});

test("an already-normalised definition is unchanged", () => {
  const current = storedFixture();

  assert.deepEqual(normaliseWorkflowDefinition(current), current);
});
