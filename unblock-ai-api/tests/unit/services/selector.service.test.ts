import test from "node:test";
import assert from "node:assert/strict";
import type { AzureOpenAI } from "openai";
import { SelectorService } from "../../../src/services/selector.service.js";
import { SelectionError } from "../../../src/errors/selection.error.js";
import { config } from "../../../src/config/index.config.js";
import type { BoostedCandidate } from "../../../src/lib/types/selection/candidate.type.js";
import type { SelectorDecision } from "../../../src/lib/types/selection/decision.type.js";

function fakeClient(payload: SelectorDecision): AzureOpenAI {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: JSON.stringify(payload) } }],
        }),
      },
    },
  } as unknown as AzureOpenAI;
}

function candidate(overrides: Partial<BoostedCandidate>): BoostedCandidate {
  return {
    workflow_id: "x",
    version: 1,
    title: "X",
    description: "",
    score: 0.8,
    aliases_lower: [],
    retrieval_summary: { one_liner: "x" } as BoostedCandidate["retrieval_summary"],
    retrieval_text: "",
    base_score: 0.8,
    alias_hits: [],
    ...overrides,
  };
}

const candidates: BoostedCandidate[] = [
  candidate({ workflow_id: "it_leave", title: "IT Overseas Leave", score: 0.8 }),
  candidate({ workflow_id: "eng_leave", title: "Eng Overseas Leave", score: 0.79 }),
];

test("a hallucinated workflow_id is downgraded to ambiguous", async () => {
  const service = new SelectorService({
    client: fakeClient({
      decision: "matched",
      workflow_id: "invented_id",
      confidence: "high",
      question: null,
      options: [],
      reasoning: "",
    }),
  });
  const out = await service.decide(candidates, [{ role: "user", text: "leave" }]);
  assert.equal(out.decision, "ambiguous");
  assert.equal(out.workflow_id, null);
});

test("a low-confidence match is downgraded to ambiguous", async () => {
  const service = new SelectorService({
    client: fakeClient({
      decision: "matched",
      workflow_id: "it_leave",
      confidence: "low",
      question: null,
      options: [],
      reasoning: "",
    }),
  });
  const out = await service.decide(candidates, [{ role: "user", text: "leave" }]);
  assert.equal(out.decision, "ambiguous");
  assert.ok(out.options.length > 0, "must offer options when falling back");
});

test("an ambiguous verdict without a question gets one", async () => {
  const service = new SelectorService({
    client: fakeClient({
      decision: "ambiguous",
      workflow_id: null,
      confidence: "medium",
      question: null,
      options: [],
      reasoning: "",
    }),
  });
  const out = await service.decide(candidates, [{ role: "user", text: "leave" }]);
  assert.ok(out.question);
});

test("empty candidates short-circuit to no_match without a model call", async () => {
  let called = false;
  const client = {
    chat: {
      completions: {
        create: async () => {
          called = true;
          throw new Error("should not be called");
        },
      },
    },
  } as unknown as AzureOpenAI;
  const service = new SelectorService({ client });
  const out = await service.decide([], [{ role: "user", text: "anything" }]);
  assert.equal(out.decision, "no_match");
  assert.equal(called, false);
});

test("a valid high-confidence match passes through untouched", async () => {
  const service = new SelectorService({
    client: fakeClient({
      decision: "matched",
      workflow_id: "it_leave",
      confidence: "high",
      question: null,
      options: [],
      reasoning: "faculty matched",
    }),
  });
  const out = await service.decide(candidates, [{ role: "user", text: "IT overseas leave" }]);
  assert.equal(out.decision, "matched");
  assert.equal(out.workflow_id, "it_leave");
});

test("a transport failure surfaces as SelectionError", async () => {
  const client = {
    chat: {
      completions: {
        create: async () => {
          throw new Error("503 upstream");
        },
      },
    },
  } as unknown as AzureOpenAI;
  const service = new SelectorService({ client });
  await assert.rejects(
    () => service.decide(candidates, [{ role: "user", text: "leave" }]),
    (err: unknown) => err instanceof SelectionError && /503 upstream/.test(err.message),
  );
});

test("the request carries strict structured output and the candidate summaries", async () => {
  let sent: Record<string, unknown> | null = null;
  const client = {
    chat: {
      completions: {
        create: async (body: Record<string, unknown>) => {
          sent = body;
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    decision: "no_match",
                    workflow_id: null,
                    confidence: "high",
                    question: null,
                    options: [],
                    reasoning: "",
                  }),
                },
              },
            ],
          };
        },
      },
    },
  } as unknown as AzureOpenAI;
  const service = new SelectorService({ client, deployment: "gpt-4o" });

  await service.decide(candidates, [{ role: "user", text: "leave" }]);

  const body = sent as unknown as {
    response_format: { type: string; json_schema: { strict: boolean } };
    temperature: number;
    messages: Array<{ content: string }>;
  };
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.temperature, 0, "non-reasoning deployments pin temperature to 0");
  assert.match(body.messages[1]!.content, /it_leave/);
  assert.match(body.messages[1]!.content, /eng_leave/);
});

test("with no deployment override, the service defaults to the configured selector deployment", async () => {
  let sentModel: string | null = null;
  const client = {
    chat: {
      completions: {
        create: async (body: Record<string, unknown>) => {
          sentModel = body.model as string;
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    decision: "no_match",
                    workflow_id: null,
                    confidence: "high",
                    question: null,
                    options: [],
                    reasoning: "",
                  }),
                },
              },
            ],
          };
        },
      },
    },
  } as unknown as AzureOpenAI;

  // Guards the deviation documented in azure-openai.client.ts: the SDK routes
  // on the deployment its client was built with, ignoring the body's `model`.
  // If SelectorService silently defaulted to the extraction deployment, every
  // selector call would misroute.
  const service = new SelectorService({ client });
  await service.decide(candidates, [{ role: "user", text: "leave" }]);

  assert.equal(sentModel, config.azureOpenAI.selectorDeployment);
});

test("reasoning deployments omit temperature", async () => {
  let sent: Record<string, unknown> | null = null;
  const client = {
    chat: {
      completions: {
        create: async (body: Record<string, unknown>) => {
          sent = body;
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    decision: "no_match",
                    workflow_id: null,
                    confidence: "high",
                    question: null,
                    options: [],
                    reasoning: "",
                  }),
                },
              },
            ],
          };
        },
      },
    },
  } as unknown as AzureOpenAI;
  const service = new SelectorService({ client, deployment: "o3-mini" });

  await service.decide(candidates, [{ role: "user", text: "leave" }]);
  assert.equal(sent !== null && "temperature" in sent, false);
});
