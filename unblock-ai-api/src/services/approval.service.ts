import {
  ACTIVE_TASK_STEP_STATUSES,
  ApprovalChannel,
  COMMENT_REQUIRED_DECISIONS,
  TASK_FIELD_LIMIT,
  TaskStatus,
} from "../data/constants/task.constant.js";
import {
  approvalAlreadyDecided,
  approvalCommentRequired,
  approvalLinkExpired,
  approvalLinkInvalid,
  approvalNotFound,
} from "../errors/approval.error.js";
import { ValidationError } from "../errors/validation.error.js";
import { hashApprovalToken, verifyToken } from "../utils/approval/token.util.js";
import { isAssignedTo, isLiveApproval } from "../utils/approval/approver-identity.util.js";
import { computedFields } from "../utils/task/task-view.util.js";
import { normalizeOptionalText } from "../utils/shared/text.util.js";
import type { ITaskModel } from "../models/task.model.js";
import type { TaskEngineService } from "./task-engine.service.js";
import type { TaskTransitionService } from "./task-transition.service.js";
import type { MailConfig } from "../lib/types/config/config.type.js";
import type {
  ApprovalActor,
  ApprovalContext,
  ApprovalDecisionInputDto,
  ApprovalDecisionResultDto,
  ApproverView,
} from "../lib/types/approval/approval.type.js";
import type { ApproverIdentity } from "../lib/types/approval/approver-identity.type.js";

export interface ApprovalServiceOptions {
  taskModel: Pick<ITaskModel, "findById" | "findByApprovalTokenHash">;
  taskEngine: Pick<TaskEngineService, "recordDecision" | "allowedDecisions">;
  transitions: Pick<TaskTransitionService, "context" | "commit" | "now">;
  mailConfig: Pick<MailConfig, "tokenSecret">;
}

export class ApprovalService {
  private readonly taskModel: ApprovalServiceOptions["taskModel"];
  private readonly taskEngine: ApprovalServiceOptions["taskEngine"];
  private readonly transitions: ApprovalServiceOptions["transitions"];
  private readonly mailConfig: ApprovalServiceOptions["mailConfig"];

  constructor(options: ApprovalServiceOptions) {
    this.taskModel = options.taskModel;
    this.taskEngine = options.taskEngine;
    this.transitions = options.transitions;
    this.mailConfig = options.mailConfig;
  }

  async getView(token: string): Promise<ApproverView> {
    return this.buildView(await this.resolveToken(token));
  }

  async decide(token: string, input: ApprovalDecisionInputDto): Promise<ApprovalDecisionResultDto> {
    const context = await this.resolveToken(token);
    return this.applyDecision(context, input, { channel: ApprovalChannel.EMAIL_LINK, user_id: context.step.assignee?.user_id ?? null });
  }

  async getViewForAssignee(taskId: string, stepId: string, identity: ApproverIdentity): Promise<ApproverView> {
    return this.buildView(await this.resolveAssignment(taskId, stepId, identity));
  }

  async decideAsAssignee(
    taskId: string,
    stepId: string,
    identity: ApproverIdentity,
    input: ApprovalDecisionInputDto,
  ): Promise<ApprovalDecisionResultDto> {
    const context = await this.resolveAssignment(taskId, stepId, identity);
    return this.applyDecision(context, input, { channel: ApprovalChannel.APP, user_id: identity.userId });
  }

  private async buildView(context: ApprovalContext): Promise<ApproverView> {
    const engineContext = await this.transitions.context(context.task);
    return {
      context,
      allowedDecisions: context.live ? this.taskEngine.allowedDecisions(context.task, context.step.id, engineContext) : [],
      computed: computedFields(context.task, engineContext.definition),
    };
  }

  private async applyDecision(
    { task, step, live }: ApprovalContext,
    input: ApprovalDecisionInputDto,
    actor: ApprovalActor,
  ): Promise<ApprovalDecisionResultDto> {
    if (!live) throw approvalAlreadyDecided();

    const comment = normalizeOptionalText(input.comment);
    if (comment !== null && comment.length > TASK_FIELD_LIMIT.COMMENT_MAX_LENGTH) {
      throw new ValidationError(`comment must be at most ${TASK_FIELD_LIMIT.COMMENT_MAX_LENGTH} characters`);
    }
    if (comment === null && COMMENT_REQUIRED_DECISIONS.includes(input.decision)) throw approvalCommentRequired(input.decision);

    const result = this.taskEngine.recordDecision(task, step.id, input.decision, comment, actor, await this.transitions.context(task));
    const saved = await this.transitions.commit(result, task.revision);
    const next = saved.steps.find((candidate) => ACTIVE_TASK_STEP_STATUSES.includes(candidate.status));
    return { decision: input.decision, task_status: saved.status, next_step_name: next?.name ?? null };
  }

  private async resolveToken(token: string): Promise<ApprovalContext> {
    const payload = verifyToken(token, this.mailConfig.tokenSecret);
    if (payload === null) throw approvalLinkInvalid();
    const tokenHash = hashApprovalToken(token);

    const live = await this.taskModel.findByApprovalTokenHash(tokenHash);
    const liveStep = live?.steps.find((candidate) => candidate.id === payload.step_id && candidate.approval?.token_hash === tokenHash);
    if (live && liveStep?.approval) {
      if (liveStep.approval.token_expires_at !== null && liveStep.approval.token_expires_at.getTime() < this.transitions.now().getTime()) {
        throw approvalLinkExpired();
      }
      if (!isLiveApproval(liveStep)) throw approvalLinkInvalid();
      return { task: live, step: liveStep, live: true };
    }

    const task = await this.taskModel.findById(payload.task_id);
    const step = task?.steps.find((candidate) => candidate.id === payload.step_id);
    if (!task || !step?.approval || step.approval.decision === null) throw approvalLinkInvalid();
    return { task, step, live: false };
  }

  // Never reads token_hash or token_expires_at: a failed or expired email must not block a signed-in approver.
  private async resolveAssignment(taskId: string, stepId: string, identity: ApproverIdentity): Promise<ApprovalContext> {
    const task = await this.taskModel.findById(taskId);
    const step = task?.steps.find((candidate) => candidate.id === stepId);
    if (!task || !step?.approval || task.created_by === identity.userId || !isAssignedTo(step.assignee, identity)) {
      throw approvalNotFound(taskId, stepId);
    }
    return { task, step, live: isLiveApproval(step) && task.status === TaskStatus.IN_PROGRESS };
  }
}
