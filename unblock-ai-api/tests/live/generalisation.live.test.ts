import { test } from "node:test";
import assert from "node:assert/strict";
import { ExtractionService } from "../../src/services/extraction.service.js";
import { ValidationService } from "../../src/services/validation.service.js";
import { readInputFixture } from "../helpers/live.helper.js";

test("Lab Equipment Purchase Request — unseen workflow generalises correctly", async () => {
  const extractionService = new ExtractionService({ validationService: new ValidationService() });
  const { workflow } = await extractionService.extract(readInputFixture("lab_equipment_purchase_request.txt"));

  const supervisorReview = workflow.steps.find((s) => s.type === "approval" && s.depends_on.length === 0);
  assert.ok(supervisorReview, "an entry-point approval step must exist for the Supervisor");
  assert.equal(supervisorReview?.outcomes.request_more_info?.return_to_step, "self");
  assert.equal(supervisorReview?.outcomes.rejected?.action, "terminate_workflow");

  const costGatedStep = workflow.steps.find(
    (s) =>
      s.depends_on.some((d) => d.step_id === supervisorReview?.id) &&
      s.condition?.operator === "greater_than" &&
      s.condition?.right === 5000,
  );
  assert.ok(costGatedStep, "a step depending on the Supervisor must be conditional on cost > 5000 (the Procurement gate)");
  assert.equal(workflow.completion.required_steps.includes(costGatedStep?.id ?? ""), true);

  const allAssignees = workflow.steps.flatMap((s) => [
    s.assignee,
    ...(s.outcomes.rejected?.notify ?? []),
  ]);
  assert.equal(
    allAssignees.every((actor) => !/\b(mr|mrs|dr|prof)\.?\s/i.test(actor.display_name ?? "")),
    true,
    "no step assignee should hard-code a real person's name",
  );
  assert.equal(
    allAssignees.every((actor) => ["dynamic", "static", "requester", "system"].includes(actor.resolution)),
    true,
    "every assignee must use a role-based resolution strategy, never a literal name",
  );
});
