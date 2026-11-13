import test from "node:test";
import assert from "node:assert/strict";
import { compileTaskPlan } from "../../../src/utils/task/task-plan-compiler.util.js";
import { AssigneeSource } from "../../../src/data/constants/assignee.constant.js";
import { FormFieldControl, FormSectionKind } from "../../../src/data/constants/task-form.constant.js";
import { ENTRY_FORM_STEP_ID, TaskStepKind, TaskStepOrigin, TaskStepOutcome, TaskStepStatus } from "../../../src/data/constants/task.constant.js";
import { loadExpectedFixture } from "../../helpers/fixture.helper.js";
import { sampleRequesterProfile } from "../../helpers/organisation-catalogue.helper.js";
import { choiceResolution, directoryResolution, leaveResolutions } from "../../helpers/task-fixture.helper.js";
import type { WorkflowDefinition, WorkflowInput } from "../../../src/lib/types/workflow/workflow.type.js";

const KAVINDU = sampleRequesterProfile("Kavindu Jayawardena");

function fieldsOf(plan: ReturnType<typeof compileTaskPlan>, formId: string, kind: FormSectionKind) {
  return plan.forms.find((form) => form.id === formId)?.sections.find((section) => section.kind === kind)?.fields ?? [];
}

test("the IT fixture compiles to an entry form, approver details and directory assignees", () => {
  const plan = compileTaskPlan({ definition: loadExpectedFixture("it_faculty_overseas_leave.json"), profile: KAVINDU, resolutions: leaveResolutions() });

  assert.deepEqual(plan.steps.map((step) => step.id), [ENTRY_FORM_STEP_ID, "advisor_review", "hod_review", "dean_review"]);
  assert.ok(plan.steps.every((step) => step.status === TaskStepStatus.UPCOMING));
  assert.equal(plan.steps[0]!.origin, TaskStepOrigin.ENTRY_FORM);
  assert.deepEqual(plan.steps[1]!.depends_on, [{ step_id: ENTRY_FORM_STEP_ID, required_outcome: TaskStepOutcome.COMPLETED }]);
  assert.equal(plan.steps[2]!.depends_on[0]!.required_outcome, TaskStepOutcome.APPROVED);
  assert.equal(plan.steps[2]!.assignee?.full_name, "Dinesh Wijesinghe");
  assert.equal(plan.steps[3]!.assignee?.full_name, "Sunethra Ratnayake");
  assert.ok(plan.steps[3]!.condition);
  assert.equal(plan.steps[1]!.approval?.allows_information_request, true);
  assert.equal(plan.steps[1]!.approval?.terminates_on_rejection, true);

  const details = fieldsOf(plan, "entry_form__form", FormSectionKind.REQUESTER_DETAILS);
  assert.deepEqual(details.map((field) => [field.id, field.locked]), [
    ["requester.full_name", true],
    ["requester.email", true],
    ["requester.faculty", true],
    ["requester.department", true],
  ]);
  assert.equal(plan.values["requester.email"], "u17@u.c");

  const request = fieldsOf(plan, "entry_form__form", FormSectionKind.REQUEST_DETAILS);
  assert.deepEqual(request.map((field) => field.id), [
    "inputs.student_index_number",
    "inputs.destination_country",
    "inputs.destination_city",
    "inputs.departure_date",
    "inputs.return_date",
    "inputs.travel_reason",
  ]);

  const approvers = fieldsOf(plan, "entry_form__form", FormSectionKind.APPROVER_DETAILS);
  assert.equal(approvers.length, 1);
  assert.equal(approvers[0]!.id, "assignees.advisor_review");
  assert.equal(approvers[0]!.control, FormFieldControl.PERSON);
  assert.match(approvers[0]!.label, /Academic Advisor/);
});

function withLaterForm(definition: WorkflowDefinition): WorkflowDefinition {
  const base = definition.steps[0]!;
  return {
    ...definition,
    steps: [
      ...definition.steps,
      {
        ...base,
        id: "travel_documents",
        name: "Travel documents",
        type: "data_collection",
        assignee: { resolution: "requester", role: null, relative_to: null, directory_query: null, fallback_role: null, display_name: null },
        depends_on: [{ step_id: "hod_review", required_outcome: "approved" }],
        condition: null,
        collects_inputs: ["destination_city"],
      },
    ],
  };
}

test("inputs collected by a later step get their own form", () => {
  const plan = compileTaskPlan({
    definition: withLaterForm(loadExpectedFixture("it_faculty_overseas_leave.json")),
    profile: KAVINDU,
    resolutions: leaveResolutions(),
  });

  const later = plan.steps.find((step) => step.id === "travel_documents");
  assert.equal(later?.kind, TaskStepKind.FORM);
  assert.equal(later?.form_id, "travel_documents__form");
  assert.deepEqual(fieldsOf(plan, "travel_documents__form", FormSectionKind.REQUEST_DETAILS).map((field) => field.id), ["inputs.destination_city"]);
  assert.ok(!fieldsOf(plan, "entry_form__form", FormSectionKind.REQUEST_DETAILS).some((field) => field.id === "inputs.destination_city"));
  assert.equal(plan.forms.length, 2);
});

test("file inputs are listed as unsupported and legacy identity inputs are locked", () => {
  const definition = loadExpectedFixture("it_faculty_overseas_leave.json");
  const template = definition.inputs[0]!;
  const extra: WorkflowInput[] = [
    { ...template, id: "invitation_letter", label: "Invitation letter", type: "file" },
    { ...template, id: "requester_email", label: "Your email", type: "email" },
  ];
  const plan = compileTaskPlan({ definition: { ...definition, inputs: [...definition.inputs, ...extra] }, profile: KAVINDU, resolutions: leaveResolutions() });

  assert.deepEqual(plan.unsupported_inputs, [{ input_id: "invitation_letter", label: "Invitation letter" }]);
  assert.equal(plan.values["inputs.requester_email"], "u17@u.c");
  assert.ok(!fieldsOf(plan, "entry_form__form", FormSectionKind.REQUEST_DETAILS).some((field) => field.id === "inputs.requester_email"));
});

test("a requester-choice resolution becomes a select field with options", () => {
  const plan = compileTaskPlan({
    definition: loadExpectedFixture("it_faculty_overseas_leave.json"),
    profile: KAVINDU,
    resolutions: [
      directoryResolution("advisor_review", "A", "a@u.c", "Lecturer"),
      choiceResolution("hod_review"),
      directoryResolution("dean_review", "D", "d@u.c", "Dean"),
    ],
  });

  const [select] = fieldsOf(plan, "entry_form__form", FormSectionKind.APPROVER_DETAILS);
  assert.equal(select?.control, FormFieldControl.SELECT);
  assert.deepEqual(select?.options.map((option) => option.value), ["user-cse", "user-it"]);
  assert.equal(plan.steps.find((step) => step.id === "hod_review")?.assignee?.source, AssigneeSource.REQUESTER_CHOICE);
});

test("with nothing editable there is no entry form and the details move to the first form step", () => {
  const definition = withLaterForm(loadExpectedFixture("it_faculty_overseas_leave.json"));
  const later = definition.steps.find((step) => step.id === "travel_documents")!;
  const onlyLater: WorkflowDefinition = {
    ...definition,
    inputs: definition.inputs.filter((input) => input.id === "destination_city"),
    computed: [],
    steps: [{ ...later, depends_on: [] }],
    completion: { ...definition.completion, required_steps: ["travel_documents"] },
  };

  const plan = compileTaskPlan({ definition: onlyLater, profile: KAVINDU, resolutions: [] });

  assert.deepEqual(plan.steps.map((step) => step.id), ["travel_documents"]);
  assert.ok(fieldsOf(plan, "travel_documents__form", FormSectionKind.REQUESTER_DETAILS).length > 0);
});
