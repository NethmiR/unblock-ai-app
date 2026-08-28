import { logger } from "../utils/shared/logger.util.js";
import {
  approvalRequestEmail,
  completionNoticeEmail,
  moreInfoNoticeEmail,
  rejectionNoticeEmail,
} from "../data/templates/approval-email.template.js";
import type { IMailer } from "./mailer/mailer.interface.js";
import type { AppConfig } from "../lib/types/config/config.type.js";
import type { TaskDocument, TaskStepState } from "../lib/types/task/task.type.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";

export interface NotificationServiceOptions {
  mailer: IMailer;
  config: AppConfig;
}

function workflowStepName(workflow: WorkflowDefinition, stepId: string): string {
  return workflow.steps.find((step) => step.id === stepId)?.name ?? stepId;
}

export class NotificationService {
  private readonly mailer: IMailer;
  private readonly config: AppConfig;

  constructor({ mailer, config }: NotificationServiceOptions) {
    this.mailer = mailer;
    this.config = config;
  }

  async sendApprovalRequest(task: TaskDocument, workflow: WorkflowDefinition, step: TaskStepState): Promise<boolean> {
    if (!step.assignee || !step.approval_token) return false;

    const email = approvalRequestEmail({
      taskReference: task.reference,
      workflowTitle: workflow.title,
      stepName: step.name,
      approverName: step.assignee.name,
      approvalUrl: `${this.config.mail.appPublicUrl}/approvals/${step.approval_token}`,
    });

    return this.dispatch(step.assignee.email, email);
  }

  async sendRejectionNotice(task: TaskDocument, workflow: WorkflowDefinition, step: TaskStepState): Promise<boolean> {
    const requesterEmail = this.requesterEmail(task);
    if (!requesterEmail) return false;

    const email = rejectionNoticeEmail({
      taskReference: task.reference,
      workflowTitle: workflow.title,
      stepName: workflowStepName(workflow, step.step_id),
      reason: step.reason ?? "",
    });

    return this.dispatch(requesterEmail, email);
  }

  async sendCompletionNotice(task: TaskDocument, workflow: WorkflowDefinition): Promise<boolean> {
    const requesterEmail = this.requesterEmail(task);
    if (!requesterEmail) return false;

    const email = completionNoticeEmail({
      taskReference: task.reference,
      workflowTitle: workflow.title,
      documentUrl: null,
      hasAttachment: false,
    });

    return this.dispatch(requesterEmail, email);
  }

  async sendMoreInfoNotice(task: TaskDocument, workflow: WorkflowDefinition, step: TaskStepState): Promise<boolean> {
    const requesterEmail = this.requesterEmail(task);
    if (!requesterEmail) return false;

    const email = moreInfoNoticeEmail({
      taskReference: task.reference,
      workflowTitle: workflow.title,
      stepName: workflowStepName(workflow, step.step_id),
      question: step.reason ?? "",
    });

    return this.dispatch(requesterEmail, email);
  }

  // No workflow currently declares an `email`-typed requester input (see
  // approval-execution-implementation-plan.md Phase 3 notes) — requester-facing sends
  // no-op via dispatch()'s caller checking this return value, same as any failed send.
  private requesterEmail(task: TaskDocument): string | null {
    for (const requirement of task.requirements) {
      if (requirement.source !== "input" || requirement.type !== "email") continue;
      const value = task.values[requirement.key];
      if (typeof value === "string" && value.length > 0) return value;
    }
    return null;
  }

  private async dispatch(to: string, email: { subject: string; text: string; html: string }): Promise<boolean> {
    try {
      const result = await this.mailer.send({ to, ...email });
      if (!result.sent) {
        logger.error("mail send returned unsent", { to, subject: email.subject, error: result.error });
      }
      return result.sent;
    } catch (error) {
      logger.error("mail send threw", {
        to,
        subject: email.subject,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
