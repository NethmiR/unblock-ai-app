import { escapeHtml } from "../../utils/shared/html.util.js";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface ApprovalRequestContext {
  taskReference: string;
  workflowTemplateTitle: string;
  stepName: string;
  approverName: string | null;
  requesterName: string;
  requesterUnits: string[];
  isRepeatReview: boolean;
  approvalUrl: string;
  inboxUrl: string | null;
}

const FALLBACK_GREETING_NAME = "there";
const REPEAT_REVIEW_NOTE = "The requester has answered your request for more information, so this is a repeat review.";
const INBOX_NOTE = "You can also find this request in Unblock under Approvals → Pending.";
const INBOX_LINK_TEXT = "Open your approvals";
const APPROVAL_INBOX_PATH = "/dashboard/approvals";

export function approvalInboxUrl(appPublicUrl: string): string {
  return `${appPublicUrl}${APPROVAL_INBOX_PATH}`;
}

export function wrapEmail(heading: string, bodyHtml: string): string {
  return `<h1>${escapeHtml(heading)}</h1>\n${bodyHtml}`;
}

export function approvalRequestEmail(ctx: ApprovalRequestContext): RenderedEmail {
  const greetingName = ctx.approverName ?? FALLBACK_GREETING_NAME;
  const units = ctx.requesterUnits.length > 0 ? ` (${ctx.requesterUnits.join("; ")})` : "";
  const subject = `Approval needed: ${ctx.workflowTemplateTitle} (${ctx.taskReference})`;
  const text = [
    `Hi ${greetingName},`,
    "",
    `${ctx.requesterName}${units} is waiting on your decision for ${ctx.stepName} on ${ctx.workflowTemplateTitle} (${ctx.taskReference}).`,
    ...(ctx.isRepeatReview ? ["", REPEAT_REVIEW_NOTE] : []),
    "",
    `Review it here: ${ctx.approvalUrl}`,
    ...(ctx.inboxUrl === null ? [] : ["", `${INBOX_NOTE} ${ctx.inboxUrl}`]),
  ].join("\n");
  const html = wrapEmail(
    "Approval needed",
    `<p>Hi ${escapeHtml(greetingName)},</p>` +
      `<p>${escapeHtml(ctx.requesterName)}${escapeHtml(units)} is waiting on your decision for ` +
      `<strong>${escapeHtml(ctx.stepName)}</strong> on ${escapeHtml(ctx.workflowTemplateTitle)} (${escapeHtml(ctx.taskReference)}).</p>` +
      (ctx.isRepeatReview ? `<p>${escapeHtml(REPEAT_REVIEW_NOTE)}</p>` : "") +
      `<p><a href="${escapeHtml(ctx.approvalUrl)}">Review the request</a></p>` +
      (ctx.inboxUrl === null ? "" : `<p>${escapeHtml(INBOX_NOTE)} <a href="${escapeHtml(ctx.inboxUrl)}">${escapeHtml(INBOX_LINK_TEXT)}</a></p>`),
  );
  return { subject, text, html };
}
