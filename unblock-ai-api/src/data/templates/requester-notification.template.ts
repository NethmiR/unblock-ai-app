import { escapeHtml } from "../../utils/shared/html.util.js";
import { wrapEmail, type RenderedEmail } from "./approval-email.template.js";

const TASK_DETAIL_PATH = "/dashboard/tasks";
const APPROVAL_PATH = "/approvals";

export function taskDetailUrl(appPublicUrl: string, taskId: string): string {
  return `${appPublicUrl}${TASK_DETAIL_PATH}/${encodeURIComponent(taskId)}`;
}

export function approvalUrl(appPublicUrl: string, token: string): string {
  return `${appPublicUrl}${APPROVAL_PATH}/${encodeURIComponent(token)}`;
}

export interface RequesterNotificationContext {
  requesterName: string;
  taskReference: string;
  workflowTemplateTitle: string;
  taskUrl: string;
}

export interface ActionRequiredContext extends RequesterNotificationContext {
  stepName: string;
}

export interface InformationRequestedContext extends RequesterNotificationContext {
  askedBy: string | null;
  question: string;
}

export interface TaskRejectedContext extends RequesterNotificationContext {
  stepName: string;
  rejectedBy: string | null;
  comment: string | null;
}

export interface TaskCompletedContext extends RequesterNotificationContext {
  hasAttachment: boolean;
}

export interface StepNotificationContext extends RequesterNotificationContext {
  stepName: string;
  description: string | null;
}

const APPROVER_FALLBACK = "An approver";
const ATTACHMENT_NOTE = "A PDF transcript of this request is attached.";

function compose(heading: string, subject: string, ctx: RequesterNotificationContext, paragraphs: readonly string[], linkLabel: string): RenderedEmail {
  const text = [`Hi ${ctx.requesterName},`, "", ...paragraphs.flatMap((paragraph) => [paragraph, ""]), `${linkLabel}: ${ctx.taskUrl}`].join("\n");
  const html = wrapEmail(
    heading,
    `<p>Hi ${escapeHtml(ctx.requesterName)},</p>` +
      paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("") +
      `<p><a href="${escapeHtml(ctx.taskUrl)}">${escapeHtml(linkLabel)}</a></p>`,
  );
  return { subject, text, html };
}

function taskLabel(ctx: RequesterNotificationContext): string {
  return `${ctx.workflowTemplateTitle} (${ctx.taskReference})`;
}

export function actionRequiredEmail(ctx: ActionRequiredContext): RenderedEmail {
  return compose("Your input is needed", `Action needed: ${taskLabel(ctx)}`, ctx, [`${ctx.stepName} on ${taskLabel(ctx)} is waiting for you.`], "Open your request");
}

export function informationRequestedEmail(ctx: InformationRequestedContext): RenderedEmail {
  return compose(
    "More information needed",
    `More information needed: ${taskLabel(ctx)}`,
    ctx,
    [`${ctx.askedBy ?? APPROVER_FALLBACK} needs more information on ${taskLabel(ctx)}.`, `Question: ${ctx.question}`],
    "Answer the question",
  );
}

export function taskRejectedEmail(ctx: TaskRejectedContext): RenderedEmail {
  return compose(
    "Request rejected",
    `Request rejected: ${taskLabel(ctx)}`,
    ctx,
    [
      `${ctx.rejectedBy ?? APPROVER_FALLBACK} rejected ${taskLabel(ctx)} at ${ctx.stepName}.`,
      ...(ctx.comment ? [`Comment: ${ctx.comment}`] : []),
    ],
    "View your request",
  );
}

export function taskCompletedEmail(ctx: TaskCompletedContext): RenderedEmail {
  return compose(
    "Request completed",
    `Request completed: ${taskLabel(ctx)}`,
    ctx,
    [`${taskLabel(ctx)} has been approved and completed.`, ...(ctx.hasAttachment ? [ATTACHMENT_NOTE] : [])],
    "View your request",
  );
}

export function stepNotificationEmail(ctx: StepNotificationContext): RenderedEmail {
  return compose(
    "Update on a request",
    `Update: ${taskLabel(ctx)}`,
    ctx,
    [`${ctx.stepName} has been reached on ${taskLabel(ctx)}.`, ...(ctx.description ? [ctx.description] : [])],
    "View the request",
  );
}
