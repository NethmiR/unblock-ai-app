import { TaskStepOrigin } from "../data/constants/task.constant.js";
import { approvalRequestEmail, type RenderedEmail } from "../data/templates/approval-email.template.js";
import {
  actionRequiredEmail,
  approvalUrl,
  informationRequestedEmail,
  stepNotificationEmail,
  taskCompletedEmail,
  taskDetailUrl,
  taskRejectedEmail,
  type RequesterNotificationContext,
} from "../data/templates/requester-notification.template.js";
import { describeRequesterUnit } from "../utils/task/task-view.util.js";
import { describeError } from "../utils/shared/error-description.util.js";
import { logger } from "../utils/shared/logger.util.js";
import type { IMailer } from "./mailer/mailer.interface.js";
import type { DocumentConfig, MailConfig } from "../lib/types/config/config.type.js";
import type { MailAttachment } from "../lib/types/approval/mail.type.js";
import type { RenderedDocument } from "../lib/types/document/document.type.js";
import type { TaskDocument, TaskStepRecord } from "../lib/types/task/task-document.type.js";
import type { ITaskNotifier } from "../lib/types/task/task-notification.type.js";

export interface NotificationServiceOptions {
  mailer: IMailer;
  mailConfig: Pick<MailConfig, "appPublicUrl">;
  documentConfig: Pick<DocumentConfig, "attachToEmail" | "maxAttachmentBytes">;
}

export class NotificationService implements ITaskNotifier {
  private readonly mailer: IMailer;
  private readonly mailConfig: Pick<MailConfig, "appPublicUrl">;
  private readonly documentConfig: Pick<DocumentConfig, "attachToEmail" | "maxAttachmentBytes">;

  constructor({ mailer, mailConfig, documentConfig }: NotificationServiceOptions) {
    this.mailer = mailer;
    this.mailConfig = mailConfig;
    this.documentConfig = documentConfig;
  }

  sendApprovalRequest(task: TaskDocument, step: TaskStepRecord, token: string): Promise<boolean> {
    const recipient = step.assignee?.email ?? null;
    if (recipient === null) return this.skip(task, step, "approval request");
    return this.dispatch(
      recipient,
      approvalRequestEmail({
        taskReference: task.reference,
        workflowTemplateTitle: task.title,
        stepName: step.name,
        approverName: step.assignee?.full_name ?? null,
        requesterName: task.requester.full_name,
        requesterUnits: task.requester.units.map(describeRequesterUnit),
        isRepeatReview: step.origin === TaskStepOrigin.APPROVAL_REPEAT,
        approvalUrl: approvalUrl(this.mailConfig.appPublicUrl, token),
      }),
    );
  }

  sendRequesterActionRequired(task: TaskDocument, step: TaskStepRecord): Promise<boolean> {
    return this.dispatch(task.requester.email, actionRequiredEmail({ ...this.context(task), stepName: step.name }));
  }

  sendInformationRequested(task: TaskDocument, step: TaskStepRecord): Promise<boolean> {
    if (step.information_request === null) return this.skip(task, step, "information request");
    const asker = task.steps.find((candidate) => candidate.id === step.information_request?.requested_by_step_id);
    return this.dispatch(
      task.requester.email,
      informationRequestedEmail({ ...this.context(task), askedBy: asker?.assignee?.full_name ?? null, question: step.information_request.question }),
    );
  }

  sendTaskRejected(task: TaskDocument, step: TaskStepRecord): Promise<boolean> {
    return this.dispatch(
      task.requester.email,
      taskRejectedEmail({
        ...this.context(task),
        stepName: step.name,
        rejectedBy: step.assignee?.full_name ?? null,
        comment: step.approval?.comment ?? null,
      }),
    );
  }

  sendTaskCompleted(task: TaskDocument, transcript: RenderedDocument | null): Promise<boolean> {
    const attachment = this.attachmentFor(transcript);
    return this.dispatch(
      task.requester.email,
      taskCompletedEmail({ ...this.context(task), hasAttachment: attachment !== null }),
      attachment === null ? undefined : [attachment],
    );
  }

  sendStepNotification(task: TaskDocument, step: TaskStepRecord): Promise<boolean> {
    const recipient = step.assignee?.email ?? task.requester.email;
    return this.dispatch(recipient, stepNotificationEmail({ ...this.context(task), stepName: step.name, description: step.description }));
  }

  private context(task: TaskDocument): RequesterNotificationContext {
    return {
      requesterName: task.requester.full_name,
      taskReference: task.reference,
      workflowTemplateTitle: task.title,
      taskUrl: taskDetailUrl(this.mailConfig.appPublicUrl, String(task._id)),
    };
  }

  private attachmentFor(transcript: RenderedDocument | null): MailAttachment | null {
    if (transcript === null || !this.documentConfig.attachToEmail) return null;
    if (transcript.byteSize > this.documentConfig.maxAttachmentBytes) return null;
    return { filename: transcript.filename, content: transcript.buffer, contentType: transcript.contentType };
  }

  private skip(task: TaskDocument, step: TaskStepRecord, kind: string): Promise<boolean> {
    logger.warn("notification skipped; no recipient", { taskId: String(task._id), stepId: step.id, kind });
    return Promise.resolve(false);
  }

  private async dispatch(to: string, email: RenderedEmail, attachments?: MailAttachment[]): Promise<boolean> {
    try {
      const result = await this.mailer.send({ to, ...email, attachments });
      if (!result.sent) logger.error("mail send returned unsent", { to, subject: email.subject, error: result.error });
      return result.sent;
    } catch (err) {
      logger.error("mail send failed", { to, subject: email.subject, error: describeError(err) });
      return false;
    }
  }
}
