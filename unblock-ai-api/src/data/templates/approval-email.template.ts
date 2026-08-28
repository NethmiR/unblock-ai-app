export interface ApprovalRequestContext {
  taskReference: string;
  workflowTitle: string;
  stepName: string;
  approverName: string;
  approvalUrl: string;
}

export interface RejectionNoticeContext {
  taskReference: string;
  workflowTitle: string;
  stepName: string;
  reason: string;
}

export interface CompletionNoticeContext {
  taskReference: string;
  workflowTitle: string;
  documentUrl: string | null;
  hasAttachment: boolean;
}

export interface MoreInfoNoticeContext {
  taskReference: string;
  workflowTitle: string;
  stepName: string;
  question: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function wrap(heading: string, bodyHtml: string): string {
  return `<h1>${heading}</h1>\n${bodyHtml}`;
}

export function approvalRequestEmail(ctx: ApprovalRequestContext): RenderedEmail {
  const subject = `Approval needed: ${ctx.workflowTitle} (${ctx.taskReference})`;
  const text = [
    `Hi ${ctx.approverName},`,
    "",
    `${ctx.stepName} is waiting on your decision for ${ctx.workflowTitle} (${ctx.taskReference}).`,
    "",
    `Review it here: ${ctx.approvalUrl}`,
  ].join("\n");
  const html = wrap(
    "Approval needed",
    `<p>Hi ${ctx.approverName},</p>` +
      `<p><strong>${ctx.stepName}</strong> is waiting on your decision for ` +
      `${ctx.workflowTitle} (${ctx.taskReference}).</p>` +
      `<p><a href="${ctx.approvalUrl}">Review the request</a></p>`,
  );
  return { subject, text, html };
}

export function rejectionNoticeEmail(ctx: RejectionNoticeContext): RenderedEmail {
  const subject = `Request rejected: ${ctx.workflowTitle} (${ctx.taskReference})`;
  const text = [
    `Your request for ${ctx.workflowTitle} (${ctx.taskReference}) was rejected at ${ctx.stepName}.`,
    "",
    `Reason: ${ctx.reason}`,
  ].join("\n");
  const html = wrap(
    "Request rejected",
    `<p>Your request for ${ctx.workflowTitle} (${ctx.taskReference}) was rejected at ` +
      `<strong>${ctx.stepName}</strong>.</p>` +
      `<p><strong>Reason:</strong> ${ctx.reason}</p>`,
  );
  return { subject, text, html };
}

export function completionNoticeEmail(ctx: CompletionNoticeContext): RenderedEmail {
  const subject = `Request approved: ${ctx.workflowTitle} (${ctx.taskReference})`;

  const textLines = [
    `Your request for ${ctx.workflowTitle} (${ctx.taskReference}) has been approved and completed.`,
  ];
  const htmlLines = [
    `<p>Your request for ${ctx.workflowTitle} (${ctx.taskReference}) has been approved and completed.</p>`,
  ];

  if (ctx.hasAttachment) {
    textLines.push("A PDF record of this request is attached.");
    htmlLines.push("<p>A PDF record of this request is attached.</p>");
  }
  if (ctx.documentUrl) {
    textLines.push(`Download it here: ${ctx.documentUrl}`);
    htmlLines.push(`<p><a href="${ctx.documentUrl}">Download the record</a></p>`);
  }

  const text = textLines.join("\n\n");
  const html = wrap("Request approved", htmlLines.join("\n"));
  return { subject, text, html };
}

export function moreInfoNoticeEmail(ctx: MoreInfoNoticeContext): RenderedEmail {
  const subject = `More information needed: ${ctx.workflowTitle} (${ctx.taskReference})`;
  const text = [
    `${ctx.stepName} needs more information on your request for ${ctx.workflowTitle} (${ctx.taskReference}).`,
    "",
    `Question: ${ctx.question}`,
  ].join("\n");
  const html = wrap(
    "More information needed",
    `<p><strong>${ctx.stepName}</strong> needs more information on your request for ` +
      `${ctx.workflowTitle} (${ctx.taskReference}).</p>` +
      `<p><strong>Question:</strong> ${ctx.question}</p>`,
  );
  return { subject, text, html };
}
