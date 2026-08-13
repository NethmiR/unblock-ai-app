import { test } from "node:test";
import assert from "node:assert/strict";
import { ExtractionService } from "../../src/services/extraction.service.js";
import { ValidationService } from "../../src/services/validation.service.js";
import { readInputFixture, stepById } from "../helpers/live.helper.js";
import type { WorkflowDefinition } from "../../src/lib/types/workflow/workflow.type.js";

const RUNS = 5;

function structuralFingerprint(workflow: WorkflowDefinition): unknown {
  const dean = stepById(workflow, "dean_review");
  return {
    stepIds: workflow.steps.map((s) => s.id).sort(),
    dependencies: workflow.steps
      .map((s) => ({
        id: s.id,
        depends_on: s.depends_on.map((d) => `${d.step_id}:${d.required_outcome}`).sort(),
        initial_state: s.initial_state,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    deanCondition: dean?.condition
      ? { operator: dean.condition.operator, left: dean.condition.left, right: dean.condition.right }
      : null,
    requiredSteps: [...workflow.completion.required_steps].sort(),
  };
}

test("IT Faculty Overseas Leave — structure is stable across 5 identical runs", async () => {
  const extractionService = new ExtractionService({ validationService: new ValidationService() });
  const text = readInputFixture("it_faculty_overseas_leave.txt");
  const results = await Promise.all(
    Array.from({ length: RUNS }, () => extractionService.extract(text)),
  );

  const fingerprints = results.map((r) => structuralFingerprint(r.workflow));
  const first = fingerprints[0];

  for (let i = 1; i < fingerprints.length; i++) {
    assert.deepEqual(fingerprints[i], first, `Run ${i + 1} structure diverged from run 1`);
  }
});

test("Departmental Event & Workshop — structure is stable across 5 identical runs", async () => {
  const extractionService = new ExtractionService({ validationService: new ValidationService() });
  const text = readInputFixture("departmental_event_workshop.txt");
  const results = await Promise.all(
    Array.from({ length: RUNS }, () => extractionService.extract(text)),
  );

  const fingerprints = results.map((r) => structuralFingerprint(r.workflow));
  const first = fingerprints[0];

  for (let i = 1; i < fingerprints.length; i++) {
    assert.deepEqual(fingerprints[i], first, `Run ${i + 1} structure diverged from run 1`);
  }
});
