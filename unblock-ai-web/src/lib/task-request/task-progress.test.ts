import { describe, expect, it } from "vitest";
import { buildStep } from "@/lib/testing/task-request-fixture";
import {
  currentStepIndex,
  hasStepAwaitingApprover,
  isInsertedStep,
  progressRatio,
  selectedStepId,
  stepNumber,
  visibleSteps,
} from "./task-progress";
import { TaskStepKind, TaskStepOrigin, TaskStepStatus } from "@/types/task";

const STEPS = [
  buildStep({ id: "entry_form", kind: TaskStepKind.FORM, status: TaskStepStatus.COMPLETED }),
  buildStep({ id: "advisor", status: TaskStepStatus.COMPLETED }),
  buildStep({ id: "advisor__information_request_1", origin: TaskStepOrigin.INFORMATION_REQUEST, status: TaskStepStatus.COMPLETED }),
  buildStep({ id: "advisor__repeat_1", origin: TaskStepOrigin.APPROVAL_REPEAT, status: TaskStepStatus.AWAITING_APPROVER }),
  buildStep({ id: "dean", status: TaskStepStatus.SKIPPED }),
  buildStep({ id: "registrar", status: TaskStepStatus.UPCOMING }),
];
const TASK = { steps: STEPS };

describe("task progress", () => {
  it("numbers steps without skipped or cancelled ones, including inserted steps", () => {
    expect(visibleSteps(STEPS).map((step) => step.id)).toEqual(["entry_form", "advisor", "advisor__information_request_1", "advisor__repeat_1", "registrar"]);
    expect(stepNumber(STEPS[3], TASK)).toEqual({ number: 4, total: 5 });
    expect(stepNumber(STEPS[5], TASK)).toEqual({ number: 5, total: 5 });
    expect(stepNumber(STEPS[4], TASK)).toBeNull();
  });

  it("selects the step parameter, then the current step, then the last completed step", () => {
    expect(selectedStepId(TASK, "dean")).toBe("dean");
    expect(selectedStepId(TASK, "missing")).toBe("advisor__repeat_1");
    expect(selectedStepId(TASK, null)).toBe("advisor__repeat_1");
    const finished = { steps: STEPS.slice(0, 3) };
    expect(selectedStepId(finished, null)).toBe("advisor__information_request_1");
    expect(selectedStepId({ steps: [] }, null)).toBeNull();
  });

  it("reports the stepper index, approver waits and inserted steps", () => {
    expect(currentStepIndex(TASK)).toBe(3);
    expect(currentStepIndex(finishedTask())).toBe(2);
    expect(hasStepAwaitingApprover(TASK)).toBe(true);
    expect(isInsertedStep(STEPS[2])).toBe(true);
    expect(isInsertedStep(STEPS[1])).toBe(false);
  });

  it("computes a bounded ratio", () => {
    expect(progressRatio(2, 4)).toBe(0.5);
    expect(progressRatio(0, 0)).toBe(0);
  });
});

function finishedTask() {
  return { steps: [buildStep({ id: "a", status: TaskStepStatus.COMPLETED }), buildStep({ id: "b", status: TaskStepStatus.COMPLETED })] };
}
