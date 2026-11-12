import type { Request, Response } from "express";
import { requireAuthContext } from "../utils/http/auth-context.util.js";
import {
  optionalNonEmptyString,
  optionalNullableString,
  parseBooleanQuery,
  requireNonEmptyString,
  requireUuid,
} from "../utils/http/request-validator.util.js";
import {
  serializeWorkflowTemplate,
  serializeWorkflowTemplateSummary,
  serializeWorkflowTemplateVersion,
  serializeWorkflowTemplateVersionSummary,
} from "../utils/http/workflow-template-serializer.util.js";
import { hasAnyPermission } from "../utils/auth/permission.util.js";
import { Permission } from "../data/constants/permission.constant.js";
import { WorkflowTemplateVisibility } from "../data/constants/workflow-template.constant.js";
import { ValidationError } from "../errors/validation.error.js";
import type { WorkflowTemplateService } from "../services/workflow-template.service.js";
import type { WorkflowTemplateDetail } from "../lib/types/workflow-template/workflow-template.type.js";

export interface WorkflowTemplateControllerOptions {
  workflowTemplateService: WorkflowTemplateService;
}

function workflowTemplateIdOf(req: Request): string {
  return requireUuid(req.params.workflowTemplateId, "workflowTemplateId");
}

function versionOf(req: Request): number {
  const version = Number(req.params.version);
  if (!Number.isSafeInteger(version) || version < 1) throw new ValidationError("version must be a positive integer");
  return version;
}

function visibilityOf(req: Request): WorkflowTemplateVisibility {
  return hasAnyPermission(requireAuthContext(req).user.permissions, [Permission.WORKFLOW_MANAGE])
    ? WorkflowTemplateVisibility.ALL
    : WorkflowTemplateVisibility.PUBLISHED;
}

function respond(res: Response, status: number, detail: WorkflowTemplateDetail): void {
  res.status(status).json({ workflow_template: serializeWorkflowTemplate(detail) });
}

export class WorkflowTemplateController {
  private readonly workflowTemplateService: WorkflowTemplateService;

  constructor({ workflowTemplateService }: WorkflowTemplateControllerOptions) {
    this.workflowTemplateService = workflowTemplateService;
  }

  list = async (req: Request, res: Response): Promise<void> => {
    const { templates, users } = await this.workflowTemplateService.list({
      includeArchived: parseBooleanQuery(req.query.include_archived, "include_archived"),
      visibility: visibilityOf(req),
    });
    res.status(200).json({ workflow_templates: templates.map((template) => serializeWorkflowTemplateSummary(template, users)) });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    respond(res, 200, await this.workflowTemplateService.get(workflowTemplateIdOf(req), visibilityOf(req)));
  };

  createDraft = async (req: Request, res: Response): Promise<void> => {
    const detail = await this.workflowTemplateService.createDraft(
      { title: requireNonEmptyString(req.body, "title"), prompt: requireNonEmptyString(req.body, "prompt") },
      requireAuthContext(req).user.id,
    );
    respond(res, 201, detail);
  };

  generate = async (req: Request, res: Response): Promise<void> => {
    const detail = await this.workflowTemplateService.generateNew(
      { title: optionalNonEmptyString(req.body, "title") ?? null, prompt: requireNonEmptyString(req.body, "prompt") },
      requireAuthContext(req).user.id,
    );
    respond(res, 201, detail);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const detail = await this.workflowTemplateService.update(
      workflowTemplateIdOf(req),
      { title: optionalNonEmptyString(req.body, "title"), draftPrompt: optionalNullableString(req.body, "draft_prompt") },
      requireAuthContext(req).user.id,
    );
    respond(res, 200, detail);
  };

  regenerate = async (req: Request, res: Response): Promise<void> => {
    const detail = await this.workflowTemplateService.regenerate(
      workflowTemplateIdOf(req),
      { title: optionalNonEmptyString(req.body, "title") ?? null, prompt: requireNonEmptyString(req.body, "prompt") },
      requireAuthContext(req).user.id,
    );
    respond(res, 201, detail);
  };

  publish = async (req: Request, res: Response): Promise<void> => {
    respond(res, 200, await this.workflowTemplateService.publish(workflowTemplateIdOf(req), requireAuthContext(req).user.id));
  };

  archive = async (req: Request, res: Response): Promise<void> => {
    respond(res, 200, await this.workflowTemplateService.archive(workflowTemplateIdOf(req), requireAuthContext(req).user.id));
  };

  restore = async (req: Request, res: Response): Promise<void> => {
    respond(res, 200, await this.workflowTemplateService.restore(workflowTemplateIdOf(req), requireAuthContext(req).user.id));
  };

  listVersions = async (req: Request, res: Response): Promise<void> => {
    const { versions, users } = await this.workflowTemplateService.listVersions(workflowTemplateIdOf(req), visibilityOf(req));
    res.status(200).json({ versions: versions.map((version) => serializeWorkflowTemplateVersionSummary(version, users)) });
  };

  getVersion = async (req: Request, res: Response): Promise<void> => {
    const { version, users } = await this.workflowTemplateService.getVersion(
      workflowTemplateIdOf(req),
      versionOf(req),
      visibilityOf(req),
    );
    res.status(200).json({ version: serializeWorkflowTemplateVersion(version, users) });
  };
}
