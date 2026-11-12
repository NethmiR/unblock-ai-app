import { test } from "node:test";
import assert from "node:assert/strict";
import { readInputFixture, stepById } from "../helpers/live.helper.js";
import { generateDefinition } from "./workflow-template-generation.helper.js";
import type { StoredWorkflowDefinition } from "../../src/lib/types/workflow-template/workflow-template.type.js";

const RUNS = 5;

function structuralFingerprint(definition: StoredWorkflowDefinition): unknown {
  const dean = stepById(definition, "dean_review");
  return {
    stepIds: definition.steps.map((s) => s.id).sort(),
    dependencies: definition.steps
      .map((s) => ({
        id: s.id,
        depends_on: s.depends_on.map((d) => `${d.step_id}:${d.required_outcome}`).sort(),
        initial_state: s.initial_state,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    deanCondition: dean?.condition
      ? { operator: dean.condition.operator, left: dean.condition.left, right: dean.condition.right }
      : null,
    requiredSteps: [...definition.completion.required_steps].sort(),
  };
}

async function assertStableStructure(inputFixture: string): Promise<void> {
  const prompt = readInputFixture(inputFixture);
  const definitions = await Promise.all(Array.from({ length: RUNS }, () => generateDefinition(prompt)));
  const fingerprints = definitions.map(structuralFingerprint);
  const first = fingerprints[0];

  for (let i = 1; i < fingerprints.length; i++) {
    assert.deepEqual(fingerprints[i], first, `Run ${i + 1} structure diverged from run 1`);
  }
}

test("IT Faculty Overseas Leave — structure is stable across 5 identical runs", async () => {
  await assertStableStructure("it_faculty_overseas_leave.txt");
});

test("Departmental Event & Workshop — structure is stable across 5 identical runs", async () => {
  await assertStableStructure("departmental_event_workshop.txt");
});
