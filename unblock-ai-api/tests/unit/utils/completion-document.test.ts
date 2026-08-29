import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { buildCompletionDocument } from "../../../src/utils/document/completion-document.util.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import type { TaskDocument, TaskStepState } from "../../../src/lib/types/task/task.type.js";
import type { TaskRequirement } from "../../../src/lib/types/task/requirement.type.js";

function buildTask(overrides: Partial<TaskDocument> = {}): TaskDocument {
  return {
    _id: new ObjectId(),
    reference: "LEAVE-2026-00001",
    session_id: "session-1",
    created_by: "user-1",
    workflow_id: "it_faculty_overseas_leave",
    version: 1,
    status: "completed",
    requirements: [],
    values: {},
    steps: [],
    audit: [],
    completion_document: null,
    created_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: new Date("2026-01-05T00:00:00Z"),
    ...overrides,
  };
}

function approvedStep(stepId: string, name: string): TaskStepState {
  return {
    step_id: stepId,
    name,
    type: "approval",
    depends_on: [],
    state: "approved",
    assignee: { name: "Jane Doe", email: "jane@example.edu" },
    outcome: "approved",
    reason: null,
    responded_at: new Date("2026-01-03T00:00:00Z"),
    approval_token: null,
    token_expires_at: null,
    token_used_at: null,
    notified_at: null,
    reopen_count: 0,
  };
}

test("request details fields follow workflow.inputs declaration order, not the requirements array order", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  const requirements: TaskRequirement[] = workflow.inputs
    .map((input) => ({
      key: input.id,
      source: "input" as const,
      ref: input.id,
      label: input.label,
      description: input.description,
      type: input.type,
      required: input.required,
      validation: input.validation,
      collection_hint: input.collection_hint,
      status: "filled" as const,
    }))
    .reverse();

  const task = buildTask({
    requirements,
    values: {
      full_name: "Alex Perera",
      student_index_number: "IT/2022/045",
      destination_country: "Singapore",
      destination_city: "Singapore",
      departure_date: "2026-03-01",
      return_date: "2026-03-10",
      travel_reason: "Conference",
      requester_email: "alex@example.edu",
    },
  });

  const doc = buildCompletionDocument(task, workflow, {
    institutionName: "Test University",
    completedAt: new Date("2026-03-15T00:00:00Z"),
  });

  const requestSection = doc.sections.find((s) => s.title === "Request details");
  assert.ok(requestSection);
  assert.deepEqual(
    requestSection!.fields.map((f) => f.label),
    workflow.inputs.map((i) => i.label),
  );
  assert.equal(requestSection!.fields[0]!.value, "Alex Perera");
});

test("an input with no matching requirement or no stored value renders as an em dash rather than being dropped", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  const task = buildTask({ requirements: [], values: {} });

  const doc = buildCompletionDocument(task, workflow, {
    institutionName: "Test University",
    completedAt: new Date(),
  });

  const requestSection = doc.sections.find((s) => s.title === "Request details")!;
  assert.equal(requestSection.fields.length, workflow.inputs.length);
  assert.ok(requestSection.fields.every((f) => f.value === "—"));
});

test("boolean values render Yes/No and person values render 'Name (email)'", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  workflow.inputs.push(
    {
      id: "guardian_consent",
      label: "Guardian Consent Given",
      description: null,
      type: "boolean",
      collected_from: {
        resolution: "requester",
        role: null,
        relative_to: null,
        directory_query: null,
        fallback_role: null,
        display_name: null,
      },
      required: false,
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
    },
    {
      id: "emergency_contact",
      label: "Emergency Contact",
      description: null,
      type: "person",
      collected_from: {
        resolution: "requester",
        role: null,
        relative_to: null,
        directory_query: null,
        fallback_role: null,
        display_name: null,
      },
      required: false,
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
    },
  );

  const requirements: TaskRequirement[] = workflow.inputs.map((input) => ({
    key: input.id,
    source: "input" as const,
    ref: input.id,
    label: input.label,
    description: input.description,
    type: input.type,
    required: input.required,
    validation: input.validation,
    collection_hint: input.collection_hint,
    status: "filled" as const,
  }));

  const task = buildTask({
    requirements,
    values: {
      guardian_consent: true,
      emergency_contact: { name: "Sam Perera", email: "sam@example.com" },
    },
  });

  const doc = buildCompletionDocument(task, workflow, {
    institutionName: "Test University",
    completedAt: new Date(),
  });

  const requestSection = doc.sections.find((s) => s.title === "Request details")!;
  assert.equal(requestSection.fields.find((f) => f.label === "Guardian Consent Given")?.value, "Yes");
  assert.equal(
    requestSection.fields.find((f) => f.label === "Emergency Contact")?.value,
    "Sam Perera (sam@example.com)",
  );
});

test("two workflow steps sharing one de-duplicated actor requirement still produce two approval rows", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  workflow.steps.push({
    ...workflow.steps[1]!,
    id: "hod_second_look",
    name: "Head of Department Second Look",
    depends_on: [{ step_id: "hod_review", required_outcome: "approved" }],
  });

  const task = buildTask({
    steps: [
      approvedStep("advisor_review", "Academic Advisor Review"),
      approvedStep("hod_review", "Head of Department Sign-off"),
      approvedStep("hod_second_look", "Head of Department Second Look"),
      { ...approvedStep("dean_review", "Dean of IT Faculty Approval"), state: "skipped" },
    ],
  });

  const doc = buildCompletionDocument(task, workflow, {
    institutionName: "Test University",
    completedAt: new Date(),
  });

  assert.equal(doc.approvals.length, 3);
  assert.deepEqual(
    doc.approvals.map((a) => a.step_name),
    ["Academic Advisor Review", "Head of Department Sign-off", "Head of Department Second Look"],
  );
  assert.ok(!doc.approvals.some((a) => a.step_name === "Dean of IT Faculty Approval"));
});

test("follow-up answers appear in their own section, after the template-ordered sections", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  const followupRequirement: TaskRequirement = {
    key: "followup:advisor_review:0",
    source: "input",
    ref: "advisor_review",
    label: "Can you confirm your travel dates don't overlap the mid-term exam?",
    description: null,
    type: "text",
    required: true,
    validation: null,
    collection_hint: null,
    status: "filled",
  };

  const task = buildTask({
    requirements: [followupRequirement],
    values: { "followup:advisor_review:0": "Confirmed, no overlap." },
  });

  const doc = buildCompletionDocument(task, workflow, {
    institutionName: "Test University",
    completedAt: new Date(),
  });

  assert.deepEqual(
    doc.sections.map((s) => s.title),
    ["Request details", "Additional information provided"],
  );

  const additionalSection = doc.sections[1]!;
  assert.equal(additionalSection.fields.length, 1);
  assert.equal(
    additionalSection.fields[0]!.label,
    "Academic Advisor Review: Can you confirm your travel dates don't overlap the mid-term exam?",
  );
  assert.equal(additionalSection.fields[0]!.value, "Confirmed, no overlap.");
});

test("no calculated-values section appears when no computed values are supplied", () => {
  const workflow = loadExpectedFixture("departmental_event_workshop.json");
  const task = buildTask({ workflow_id: workflow.workflow_id });

  const doc = buildCompletionDocument(task, workflow, {
    institutionName: "Test University",
    completedAt: new Date(),
  });

  assert.ok(!doc.sections.some((s) => s.title === "Calculated values"));
});

test("a calculated-values section is added when computed values are supplied", () => {
  const workflow = loadExpectedFixture("it_faculty_overseas_leave.json");
  const task = buildTask();

  const doc = buildCompletionDocument(task, workflow, {
    institutionName: "Test University",
    completedAt: new Date(),
    computed: [{ label: "Trip Duration (days)", value: "10" }],
  });

  assert.deepEqual(doc.sections.map((s) => s.title), ["Request details", "Calculated values"]);
  assert.deepEqual(doc.sections[1]!.fields, [{ label: "Trip Duration (days)", value: "10" }]);
});

test("approval designation falls back from display_name to title-cased role to the step name", () => {
  const workflow = loadExpectedFixture("departmental_event_workshop.json");
  const task = buildTask({
    workflow_id: workflow.workflow_id,
    steps: [
      approvedStep("hall_booking", "Hall Booking Approval"),
      approvedStep("speaker_clearance", "Guest Speaker Security Clearance"),
      approvedStep("refreshments_approval", "Refreshments Budget Approval"),
    ],
  });

  const doc = buildCompletionDocument(task, workflow, {
    institutionName: "Test University",
    completedAt: new Date(),
  });

  assert.equal(
    doc.approvals.find((a) => a.step_name === "Hall Booking Approval")?.designation,
    "Campus Administration / Hall Warden",
  );
  assert.equal(
    doc.approvals.find((a) => a.step_name === "Guest Speaker Security Clearance")?.designation,
    "Security Office",
  );
  assert.equal(
    doc.approvals.find((a) => a.step_name === "Refreshments Budget Approval")?.designation,
    "Finance Office",
  );
});

test("approval rows carry the approver's name, email, outcome, decision time, and reason", () => {
  const workflow = loadExpectedFixture("departmental_event_workshop.json");
  const rejectedStep: TaskStepState = {
    ...approvedStep("speaker_clearance", "Guest Speaker Security Clearance"),
    assignee: { name: "Priya Silva", email: "priya@security.example.edu" },
    outcome: "rejected",
    reason: "Speaker could not be verified in time.",
    responded_at: new Date("2026-01-04T00:00:00Z"),
  };

  const task = buildTask({
    workflow_id: workflow.workflow_id,
    steps: [rejectedStep],
  });

  const doc = buildCompletionDocument(task, workflow, {
    institutionName: "Test University",
    completedAt: new Date(),
  });

  assert.deepEqual(doc.approvals, [
    {
      step_name: "Guest Speaker Security Clearance",
      designation: "Security Office",
      name: "Priya Silva",
      email: "priya@security.example.edu",
      outcome: "Rejected",
      decided_at: new Date("2026-01-04T00:00:00Z"),
      reason: "Speaker could not be verified in time.",
    },
  ]);
});
