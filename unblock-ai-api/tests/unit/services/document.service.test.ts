import test from "node:test";
import assert from "node:assert/strict";
import { TextDocumentRenderer } from "../../../src/services/document/text.document.js";
import { PdfDocumentRenderer } from "../../../src/services/document/pdf.document.js";
import { createDocumentRenderer } from "../../../src/services/document/index.document.js";
import { TaskTranscriptService } from "../../../src/services/task-transcript.service.js";
import { TaskEngineService } from "../../../src/services/task-engine.service.js";
import { ConfigurationError } from "../../../src/errors/configuration.error.js";
import { ApprovalDecision } from "../../../src/data/constants/task.constant.js";
import { SelectionMessageRole } from "../../../src/data/constants/selection.constant.js";
import { buildTaskTranscript } from "../../../src/utils/document/task-transcript.util.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import { buildTaskDocument, EMAIL_ACTOR, engineContext, leaveResolutions, TASK_NOW } from "../../helpers/task-fixture.helper.js";
import type { TaskTranscript } from "../../../src/lib/types/document/document.type.js";
import type { TaskDocument } from "../../../src/lib/types/task/task-document.type.js";
import type { TaskFieldValue } from "../../../src/lib/types/task/task-value.type.js";

const LEAVE = loadExpectedFixture("it_faculty_overseas_leave.json");
const CONTEXT = engineContext(LEAVE);
const engine = new TaskEngineService();

function completedLeave(): TaskDocument {
  const entry: Record<string, TaskFieldValue> = {
    "inputs.student_index_number": "IT/2023/017",
    "inputs.destination_country": "Japan",
    "inputs.destination_city": "Tokyo",
    "inputs.departure_date": "2026-12-01",
    "inputs.return_date": "2026-12-10",
    "inputs.travel_reason": "Research visit",
    "assignees.advisor_review": { user_id: null, name: "Dr Advisor", email: "advisor@u.c" },
  };
  let task = engine.start(buildTaskDocument(LEAVE, leaveResolutions()), CONTEXT).task;
  task = {
    ...task,
    values: { ...task.values, ...entry },
    conversation: [{ role: SelectionMessageRole.REQUESTER, text: "I need overseas leave for a research visit", sent_at: TASK_NOW }],
  };
  task = engine.submitForm(task, "entry_form__form", CONTEXT).task;
  task = engine.recordDecision(task, "advisor_review", ApprovalDecision.REQUEST_MORE_INFO, "Which institute?", EMAIL_ACTOR, CONTEXT).task;
  task = { ...task, values: { ...task.values, "responses.advisor_review__information_request_1": "Tokyo Tech" } };
  task = engine.submitForm(task, "advisor_review__information_request_1__form", CONTEXT).task;
  task = engine.recordDecision(task, "advisor_review__repeat_1", ApprovalDecision.APPROVED, "Fine", EMAIL_ACTOR, CONTEXT).task;
  return engine.recordDecision(task, "hod_review", ApprovalDecision.APPROVED, null, EMAIL_ACTOR, CONTEXT).task;
}

function transcript(): TaskTranscript {
  return buildTaskTranscript(completedLeave(), LEAVE, { institutionName: "University of Moratuwa", now: TASK_NOW });
}

test("the transcript holds the conversation, form answers, the information exchange, approvals and skipped steps", () => {
  const built = transcript();

  assert.deepEqual(built.conversation, ["I need overseas leave for a research visit"]);
  assert.ok(built.sections.some((section) => section.fields.some((field) => field.label === "Destination Country" && field.value === "Japan")));
  assert.deepEqual(
    built.information_exchanges.map((exchange) => [exchange.asked_by, exchange.question, exchange.answer]),
    [["Dr Advisor", "Which institute?", "Tokyo Tech"]],
  );
  assert.deepEqual(built.approvals.map((row) => [row.step_name, row.decision, row.comment]), [
    ["Academic Advisor Review", "More information requested", "Which institute?"],
    ["Academic Advisor Review", "Approved", "Fine"],
    ["Head of Department Sign-off", "Approved", null],
  ]);
  assert.deepEqual(built.skipped_steps, ["Dean of IT Faculty Approval"]);
  assert.deepEqual(built.computed, [{ label: "Total days between departure and return, inclusive.", value: "10" }]);
  assert.equal(built.requester[0]?.value, "Kavindu Jayawardena");
});

test("the text renderer prints every transcript section", async () => {
  const rendered = await new TextDocumentRenderer().render(transcript());
  const text = rendered.buffer.toString("utf8");

  for (const heading of ["REQUESTER", "ORIGINAL REQUEST", "INFORMATION REQUESTS", "APPROVAL TRAIL", "STEPS NOT REQUIRED"]) {
    assert.ok(text.includes(heading), heading);
  }
  assert.match(text, /Answer: Tokyo Tech/);
  assert.match(text, /Dean of IT Faculty Approval: Not required/);
  assert.equal(rendered.contentType, "text/plain");
  assert.match(rendered.filename, /^TASK-2026-00001-transcript\.txt$/);
});

test("the pdf renderer produces a deterministic PDF", async () => {
  const renderer = new PdfDocumentRenderer();
  const built = transcript();

  const first = await renderer.render(built);
  const second = await renderer.render(built);

  assert.equal(first.buffer.subarray(0, 5).toString("utf8"), "%PDF-");
  assert.equal(first.contentType, "application/pdf");
  assert.equal(first.filename, "TASK-2026-00001-transcript.pdf");
  assert.equal(first.sha256, second.sha256);
});

test("an oversized free-text value paginates instead of overflowing", async () => {
  const longValue = "This is a very long answer. ".repeat(400);
  const rendered = await new PdfDocumentRenderer().render({ ...transcript(), sections: [{ title: "Request details", fields: [{ label: "Notes", value: longValue }] }] });

  const pageObjectCount = (rendered.buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  assert.ok(pageObjectCount > 1);
});

test("the transcript service returns null when documents are disabled or the renderer fails", async () => {
  const workflowTemplateService = { getDefinition: async () => LEAVE };
  const disabled = new TaskTranscriptService({
    renderer: new TextDocumentRenderer(),
    documentConfig: { enabled: false, institutionName: "U" },
    workflowTemplateService,
  });
  const failing = new TaskTranscriptService({
    renderer: { render: () => Promise.reject(new Error("boom")) },
    documentConfig: { enabled: true, institutionName: "U" },
    workflowTemplateService,
  });

  assert.equal(await disabled.renderForTask(completedLeave()), null);
  assert.equal(await failing.renderForTask(completedLeave()), null);
});

test("createDocumentRenderer picks the renderer by format", () => {
  assert.ok(createDocumentRenderer("pdf") instanceof PdfDocumentRenderer);
  assert.ok(createDocumentRenderer("text") instanceof TextDocumentRenderer);
  assert.throws(() => createDocumentRenderer("html" as unknown as "pdf"), ConfigurationError);
});
