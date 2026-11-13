import { TaskAuditEvent, TaskEffectKind } from "../data/constants/task.constant.js";
import { issueApprovalToken } from "../utils/approval/token.util.js";
import { describeError } from "../utils/shared/error-description.util.js";
import { logger } from "../utils/shared/logger.util.js";
import type { ITaskModel } from "../models/task.model.js";
import type { MailConfig } from "../lib/types/config/config.type.js";
import type { TaskDocument, TaskStepRecord } from "../lib/types/task/task-document.type.js";
import type { TaskEffect } from "../lib/types/task/task-engine.type.js";
import type { ITaskNotifier, ITaskTranscriptRenderer } from "../lib/types/task/task-notification.type.js";

export interface TaskEffectExecutorServiceOptions {
  taskModel: Pick<ITaskModel, "replaceWithRevision">;
  mailConfig: Pick<MailConfig, "tokenSecret" | "tokenTtlDays">;
  notifier?: ITaskNotifier | null;
  transcriptRenderer?: ITaskTranscriptRenderer | null;
  now?: () => Date;
}

function stepById(task: TaskDocument, stepId: string): TaskStepRecord | undefined {
  return task.steps.find((step) => step.id === stepId);
}

export class TaskEffectExecutorService {
  private readonly taskModel: Pick<ITaskModel, "replaceWithRevision">;
  private readonly mailConfig: Pick<MailConfig, "tokenSecret" | "tokenTtlDays">;
  private readonly notifier: ITaskNotifier | null;
  private readonly transcriptRenderer: ITaskTranscriptRenderer | null;
  private readonly now: () => Date;

  constructor(options: TaskEffectExecutorServiceOptions) {
    this.taskModel = options.taskModel;
    this.mailConfig = options.mailConfig;
    this.notifier = options.notifier ?? null;
    this.transcriptRenderer = options.transcriptRenderer ?? null;
    this.now = options.now ?? (() => new Date());
  }

  async execute(task: TaskDocument, effects: readonly TaskEffect[]): Promise<TaskDocument> {
    if (effects.length === 0) return task;
    const { task: tokened, tokens } = this.applyLinkEffects(task, effects);
    let current = task;
    try {
      if (tokened !== task) current = await this.taskModel.replaceWithRevision({ ...tokened, updated_at: this.now() }, task.revision);
    } catch (err) {
      logger.error("failed to store approval links", { taskId: String(task._id), error: describeError(err) });
      return task;
    }

    try {
      const notified = await this.notify(current, effects, tokens);
      if (notified === current) return current;
      return await this.taskModel.replaceWithRevision(notified, current.revision);
    } catch (err) {
      logger.error("failed to execute task notifications", { taskId: String(task._id), error: describeError(err) });
      return current;
    }
  }

  private applyLinkEffects(task: TaskDocument, effects: readonly TaskEffect[]): { task: TaskDocument; tokens: Map<string, string> } {
    const tokens = new Map<string, string>();
    let steps = task.steps;
    let changed = false;

    if (effects.some((effect) => effect.kind === TaskEffectKind.REVOKE_APPROVAL_LINKS)) {
      steps = steps.map((step) => {
        if (step.approval === null || step.approval.token_hash === null) return step;
        changed = true;
        return { ...step, approval: { ...step.approval, token_hash: null, token_expires_at: null } };
      });
    }

    const now = this.now();
    for (const effect of effects) {
      if (effect.kind !== TaskEffectKind.DISPATCH_APPROVAL) continue;
      const issued = issueApprovalToken(String(task._id), effect.step_id, this.mailConfig.tokenSecret, this.mailConfig.tokenTtlDays, now);
      tokens.set(effect.step_id, issued.token);
      changed = true;
      steps = steps.map((step) =>
        step.id === effect.step_id && step.approval
          ? { ...step, approval: { ...step.approval, token_hash: issued.tokenHash, token_expires_at: issued.expiresAt } }
          : step,
      );
    }
    return { task: changed ? { ...task, steps } : task, tokens };
  }

  private async notify(task: TaskDocument, effects: readonly TaskEffect[], tokens: ReadonlyMap<string, string>): Promise<TaskDocument> {
    let next = task;
    const now = this.now();
    for (const effect of effects) {
      if (this.notifier === null) {
        logger.debug("task notification skipped; no notifier configured", { taskId: String(task._id), effect: effect.kind });
        continue;
      }
      switch (effect.kind) {
        case TaskEffectKind.DISPATCH_APPROVAL: {
          const step = stepById(next, effect.step_id);
          const token = tokens.get(effect.step_id);
          if (!step || token === undefined) break;
          if (await this.notifier.sendApprovalRequest(next, step, token)) {
            next = {
              ...next,
              steps: next.steps.map((candidate) =>
                candidate.id === step.id && candidate.approval ? { ...candidate, approval: { ...candidate.approval, notified_at: now } } : candidate,
              ),
            };
          }
          break;
        }
        case TaskEffectKind.NOTIFY_REQUESTER_ACTION_REQUIRED: {
          const step = stepById(next, effect.step_id);
          if (step) await this.notifier.sendRequesterActionRequired(next, step);
          break;
        }
        case TaskEffectKind.NOTIFY_INFORMATION_REQUESTED: {
          const step = stepById(next, effect.step_id);
          if (step) await this.notifier.sendInformationRequested(next, step);
          break;
        }
        case TaskEffectKind.SEND_STEP_NOTIFICATION: {
          const step = stepById(next, effect.step_id);
          if (step) await this.notifier.sendStepNotification(next, step);
          break;
        }
        case TaskEffectKind.NOTIFY_TASK_REJECTED: {
          const step = stepById(next, effect.step_id);
          if (step) await this.notifier.sendTaskRejected(next, step);
          break;
        }
        case TaskEffectKind.NOTIFY_TASK_COMPLETED: {
          const transcript = this.transcriptRenderer ? await this.transcriptRenderer.renderForTask(next) : null;
          const emailed = await this.notifier.sendTaskCompleted(next, transcript);
          if (emailed && transcript) {
            next = {
              ...next,
              audit: [...next.audit, { event: TaskAuditEvent.TRANSCRIPT_EMAILED, step_id: null, detail: transcript.filename, created_at: now }],
            };
          }
          break;
        }
        case TaskEffectKind.REVOKE_APPROVAL_LINKS:
          break;
      }
    }
    return next === task ? task : { ...next, updated_at: now };
  }
}
