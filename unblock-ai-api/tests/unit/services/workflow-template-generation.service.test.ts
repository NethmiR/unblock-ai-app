import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowTemplateGenerationService } from "../../../src/services/workflow-template-generation.service.js";
import { ValidationService } from "../../../src/services/validation.service.js";
import { LlmFinishReason, LlmMessageRole, LlmOperation } from "../../../src/data/constants/llm.constant.js";
import { WorkflowTemplateGenerationError } from "../../../src/errors/workflow-template-generation.error.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import { buildOrganisationCatalogue } from "../../helpers/organisation-catalogue.helper.js";
import type { ILlmAdapter } from "../../../src/services/llm-adapter/llm-adapter.interface.js";
import type { LlmCompletionRequest } from "../../../src/lib/types/ai/llm.type.js";
import type { OrganisationCatalogue } from "../../../src/lib/types/organisation/organisation-catalogue.type.js";

function scriptedAdapter(responses: unknown[], requests: LlmCompletionRequest[]): ILlmAdapter {
  return {
    modelName: "fake",
    generateCompletion: async (request) => {
      requests.push(request);
      return {
        content: JSON.stringify(responses.shift()),
        usage: { inputTokens: null, outputTokens: null, totalTokens: null },
        finishReason: LlmFinishReason.STOP,
      };
    },
  };
}

function build(responses: unknown[], requests: LlmCompletionRequest[], catalogueCalls: OrganisationCatalogue[]) {
  const catalogue = buildOrganisationCatalogue();
  return new WorkflowTemplateGenerationService({
    llmAdapter: scriptedAdapter(responses, requests),
    validationService: new ValidationService(),
    organisationCatalogueService: {
      getCatalogue: async () => {
        catalogueCalls.push(catalogue);
        return catalogue;
      },
    },
    generationConfig: { maxAttempts: 2 },
  });
}

test("generation fetches the catalogue once, puts it in the system prompt and labels the operation", async () => {
  const requests: LlmCompletionRequest[] = [];
  const catalogueCalls: OrganisationCatalogue[] = [];
  const fixture = loadExpectedFixture("it_faculty_overseas_leave.json");
  const invalid = { ...fixture, scope: { ...fixture.scope, applies_to: { ...fixture.scope.applies_to, organisational_unit_codes: ["NOPE"] } } };

  const generated = await build([invalid, fixture], requests, catalogueCalls).generate("overseas leave");

  assert.equal(catalogueCalls.length, 1);
  assert.equal(generated.attempts, 2);
  assert.deepEqual(generated.definition.scope.applies_to.organisational_unit_codes, ["FIT"]);
  assert.ok(requests.every((request) => request.operation === LlmOperation.WORKFLOW_TEMPLATE_GENERATION));
  const systemPrompt = requests[0]!.messages.find((message) => message.role === LlmMessageRole.SYSTEM)?.content ?? "";
  assert.match(systemPrompt, /- FIT — Faculty of Information Technology/);
  assert.match(requests[1]!.messages.at(-1)!.content, /unknown organisational unit 'NOPE'/);
});

test("generation gives up after the configured attempts", async () => {
  const fixture = loadExpectedFixture("it_faculty_overseas_leave.json");
  const invalid = { ...fixture, scope: { ...fixture.scope, applies_to: { ...fixture.scope.applies_to, organisational_unit_codes: ["NOPE"] } } };

  await assert.rejects(build([invalid, invalid], [], []).generate("overseas leave"), WorkflowTemplateGenerationError);
});
