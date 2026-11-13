import { describe, expect, it } from "vitest";
import { buildField, buildStep } from "@/lib/testing/task-request-fixture";
import { formatFieldValue } from "./task-field-format";
import { informationRequester, rejectingStep, requestedByName, stepPanelHeading } from "./task-step-context";
import { AssigneeSource, TaskStepKind, TaskStepOrigin, TaskStepOutcome, TaskStepStatus } from "@/types/task";
import { FormFieldControl } from "@/types/task-form";

const ADVISOR = {
  source: AssigneeSource.REQUESTER_SUPPLIED,
  full_name: "Nimal Perera",
  email: "n@u.lk",
  designation_title: null,
  organisational_unit_name: null,
  note: null,
};

const TASK = {
  steps: [
    buildStep({ id: "advisor", assignee: ADVISOR, outcome: TaskStepOutcome.REQUEST_MORE_INFO, status: TaskStepStatus.COMPLETED }),
    buildStep({
      id: "advisor__information_request_1",
      kind: TaskStepKind.INFORMATION_REQUEST,
      origin: TaskStepOrigin.INFORMATION_REQUEST,
      status: TaskStepStatus.AWAITING_REQUESTER,
      information_request: { requested_by_step_id: "advisor", question: "Which university?" },
    }),
    buildStep({ id: "advisor__repeat_1", origin: TaskStepOrigin.APPROVAL_REPEAT, assignee: ADVISOR, outcome: TaskStepOutcome.REJECTED }),
  ],
};

describe("task step context", () => {
  it("names who requested inserted steps", () => {
    expect(informationRequester(TASK.steps[1], TASK)?.id).toBe("advisor");
    expect(requestedByName(TASK.steps[1], TASK)).toBe("Nimal Perera");
    expect(requestedByName(TASK.steps[2], TASK)).toBe("Nimal Perera");
    expect(requestedByName(TASK.steps[0], TASK)).toBeNull();
  });

  it("finds the latest rejecting step", () => {
    expect(rejectingStep(TASK)?.id).toBe("advisor__repeat_1");
    expect(rejectingStep({ steps: [] })).toBeNull();
  });

  it("headlines steps by kind and status", () => {
    expect(stepPanelHeading(TASK.steps[1]).heading).toBe("More information requested");
    expect(stepPanelHeading(buildStep({ id: "f", kind: TaskStepKind.FORM, status: TaskStepStatus.AWAITING_REQUESTER })).heading).toBe(
      "Waiting for your input",
    );
    expect(stepPanelHeading(buildStep({ id: "d", status: TaskStepStatus.SKIPPED })).heading).toBe("Not required");
  });
});

describe("formatFieldValue", () => {
  it("formats every kind of value", () => {
    expect(formatFieldValue(buildField({ id: "a" }))).toBe("—");
    expect(formatFieldValue(buildField({ id: "a", control: FormFieldControl.SWITCH, value: true }))).toBe("Yes");
    expect(formatFieldValue(buildField({ id: "a", value: { user_id: null, name: "Nimal", email: "n@u.lk" } }))).toBe("Nimal (n@u.lk)");
    expect(
      formatFieldValue(buildField({ id: "a", control: FormFieldControl.SELECT, value: "u1", options: [{ value: "u1", label: "Dinesh", description: null }] })),
    ).toBe("Dinesh");
    expect(formatFieldValue(buildField({ id: "a", control: FormFieldControl.NUMBER, value: 40 }))).toBe("40");
  });
});
