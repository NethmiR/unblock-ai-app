import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkflowTemplateGenerationSystemPrompt } from "../../../src/data/prompts/workflow-template-generation.prompt.js";
import { REQUESTER_ATTRIBUTES } from "../../../src/data/constants/requester.constant.js";
import { buildOrganisationCatalogue } from "../../helpers/organisation-catalogue.helper.js";

const prompt = buildWorkflowTemplateGenerationSystemPrompt(buildOrganisationCatalogue());

test("the prompt lists the unit catalogue codes with their parents", () => {
  assert.match(prompt, /- FIT — Faculty of Information Technology — faculty/);
  assert.match(prompt, /- IT — Department of Information Technology — department — FIT/);
});

test("the prompt lists the designation codes", () => {
  assert.match(prompt, /- head_of_department — Head of Department — department/);
  assert.match(prompt, /- dean — Dean — faculty/);
});

test("the prompt tells the model the requester is known and drops the requester_email rule", () => {
  assert.match(prompt, /The requester is already known/);
  for (const attribute of REQUESTER_ATTRIBUTES) assert.ok(prompt.includes(`requester.${attribute}`));
  assert.ok(!prompt.includes("requester_email"));
});

test("the static rules come before the catalogue blocks", () => {
  assert.ok(prompt.indexOf("Produce only the JSON object") < prompt.indexOf("## Organisational unit catalogue"));
});
