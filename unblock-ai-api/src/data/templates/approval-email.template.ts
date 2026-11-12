export interface ApprovalRequestContext {
  taskReference: string;
  workflowTemplateTitle: string;
  stepName: string;
  approverName: string;
  approvalUrl: string;
}

export interface RejectionNoticeContext {
  taskReference: string;
  workflowTemplateTitle: string;
  stepName: string;
  reason: string;
}

export interface CompletionNoticeContext {
  taskReference: string;
  workflowTemplateTitle: string;
  documentUrl: string | null;
  hasAttachment: boolean;
}

export interface MoreInfoNoticeContext {
  taskReference: string;
  workflowTemplateTitle: string;
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
  const subject = `Approval needed: ${ctx.workflowTemplateTitle} (${ctx.taskReference})`;
  const text = [
    `Hi ${ctx.approverName},`,
    "",
    `${ctx.stepName} is waiting on your decision for ${ctx.workflowTemplateTitle} (${ctx.taskReference}).`,
    "",
    `Review it here: ${ctx.approvalUrl}`,
  ].join("\n");
  const html = wrap(
    "Approval needed",
    `<p>Hi ${ctx.approverName},</p>` +
      `<p><strong>${ctx.stepName}</strong> is waiting on your decision for ` +
      `${ctx.workflowTemplateTitle} (${ctx.taskReference}).</p>` +
      `<p><a href="${ctx.approvalUrl}">Review the request</a></p>`,
  );
  return { subject, text, html };
}

export function rejectionNoticeEmail(ctx: RejectionNoticeContext): RenderedEmail {
  const subject = `Request rejected: ${ctx.workflowTemplateTitle} (${ctx.taskReference})`;
  const text = [
    `Your request for ${ctx.workflowTemplateTitle} (${ctx.taskReference}) was rejected at ${ctx.stepName}.`,
    "",
    `Reason: ${ctx.reason}`,
  ].join("\n");
  const html = wrap(
    "Request rejected",
    `<p>Your request for ${ctx.workflowTemplateTitle} (${ctx.taskReference}) was rejected at ` +
      `<strong>${ctx.stepName}</strong>.</p>` +
      `<p><strong>Reason:</strong> ${ctx.reason}</p>`,
  );
  return { subject, text, html };
}

export function completionNoticeEmail(ctx: CompletionNoticeContext): RenderedEmail {
  const subject = `Request approved: ${ctx.workflowTemplateTitle} (${ctx.taskReference})`;

  const textLines = [
    `Your request for ${ctx.workflowTemplateTitle} (${ctx.taskReference}) has been approved and completed.`,
  ];
  const htmlLines = [
    `<p>Your request for ${ctx.workflowTemplateTitle} (${ctx.taskReference}) has been approved and completed.</p>`,
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
  const subject = `More information needed: ${ctx.workflowTemplateTitle} (${ctx.taskReference})`;
  const text = [
    `${ctx.stepName} needs more information on your request for ${ctx.workflowTemplateTitle} (${ctx.taskReference}).`,
    "",
    `Question: ${ctx.question}`,
  ].join("\n");
  const html = wrap(
    "More information needed",
    `<p><strong>${ctx.stepName}</strong> needs more information on your request for ` +
      `${ctx.workflowTemplateTitle} (${ctx.taskReference}).</p>` +
      `<p><strong>Question:</strong> ${ctx.question}</p>`,
  );
  return { subject, text, html };
}
