import { ACTIVE_TASK_STEP_STATUSES, TaskStepOrigin, TaskStepStatus, type TaskDto, type TaskStepDto } from "@/types/task";

const UNCOUNTED_STATUSES: readonly TaskStepStatus[] = [TaskStepStatus.SKIPPED, TaskStepStatus.CANCELLED];
const INSERTED_ORIGINS: readonly TaskStepOrigin[] = [TaskStepOrigin.INFORMATION_REQUEST, TaskStepOrigin.APPROVAL_REPEAT];

export interface StepNumber {
  number: number;
  total: number;
}

export function isCountedStep(step: TaskStepDto): boolean {
  return !UNCOUNTED_STATUSES.includes(step.status);
}

export function isActiveStep(step: TaskStepDto): boolean {
  return ACTIVE_TASK_STEP_STATUSES.includes(step.status);
}

export function isInsertedStep(step: TaskStepDto): boolean {
  return INSERTED_ORIGINS.includes(step.origin);
}

export function visibleSteps(steps: readonly TaskStepDto[]): TaskStepDto[] {
  return steps.filter(isCountedStep);
}

export function stepNumber(step: TaskStepDto, task: Pick<TaskDto, "steps">): StepNumber | null {
  if (!isCountedStep(step)) return null;
  const counted = visibleSteps(task.steps);
  const index = counted.findIndex((candidate) => candidate.id === step.id);
  return index === -1 ? null : { number: index + 1, total: counted.length };
}

export function currentSteps(task: Pick<TaskDto, "steps">): TaskStepDto[] {
  return task.steps.filter(isActiveStep);
}

export function selectedStepId(task: Pick<TaskDto, "steps">, stepParam: string | null): string | null {
  if (stepParam !== null && task.steps.some((step) => step.id === stepParam)) return stepParam;
  const current = task.steps.find(isActiveStep);
  if (current) return current.id;
  const completed = task.steps.filter((step) => step.status === TaskStepStatus.COMPLETED);
  if (completed.length > 0) return completed[completed.length - 1].id;
  return task.steps[0]?.id ?? null;
}

export function currentStepIndex(task: Pick<TaskDto, "steps">): number {
  const counted = visibleSteps(task.steps);
  const active = counted.findIndex(isActiveStep);
  if (active !== -1) return active;
  const completedCount = counted.filter((step) => step.status === TaskStepStatus.COMPLETED).length;
  return Math.min(completedCount, counted.length);
}

export function hasStepAwaitingApprover(task: Pick<TaskDto, "steps">): boolean {
  return task.steps.some((step) => step.status === TaskStepStatus.AWAITING_APPROVER);
}

export function progressRatio(completed: number, total: number): number {
  return total === 0 ? 0 : Math.min(1, completed / total);
}
