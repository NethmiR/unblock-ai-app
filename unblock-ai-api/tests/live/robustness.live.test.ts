import { test } from "node:test";
import assert from "node:assert/strict";
import { WorkflowTemplateGenerationError } from "../../src/errors/workflow-template-generation.error.js";
import { createGenerationService, generateDefinition } from "./workflow-template-generation.helper.js";
import { validateGraph } from "../../src/utils/workflow/graph-validator.util.js";

test("very short input still produces a valid, minimal workflow", async () => {
  const workflow = await generateDefinition("Students need leave approval from HoD.");

  assert.ok(workflow.steps.length >= 1);
  assert.equal(workflow.steps.some((s) => s.type === "approval"), true);
  assert.ok(["low", "medium"].includes(workflow.metadata.confidence));
});

test("input with no approval steps produces only non-approval step types", async () => {
  const workflow = await generateDefinition(
    "Collect the student's full name and email address. No approval is required; " +
      "the request is simply logged for record-keeping once submitted.",
  );

  assert.equal(
    workflow.steps.every((s) => s.type !== "approval"),
    true,
  );
});

test("contradictory ordering ('A before B' and 'B before A') resolves to a valid, acyclic graph", async () => {
  const text =
    "Step A must be completed before Step B can start. " +
    "Step B must be completed before Step A can start. " +
    "Both are approval steps reviewed by the Registrar.";

  const workflow = await generateDefinition(text);

  assert.equal(validateGraph({ ...workflow, title: "Contradictory ordering" }).length, 0, "resolved workflow must be a valid acyclic graph");
  assert.ok(
    workflow.metadata.ambiguities.length > 0,
    "the contradictory ordering must be surfaced as an ambiguity, not silently dropped",
  );
});

test("non-workflow text is rejected rather than hallucinated into a workflow", async () => {
  const recipe =
    "To make pancakes: mix flour, milk, and eggs into a smooth batter. " +
    "Heat a pan, pour in the batter, and cook for two minutes per side. " +
    "Serve warm with syrup.";

  await assert.rejects(() => createGenerationService().generate(recipe), WorkflowTemplateGenerationError);
});
