import type { Request, Response } from "express";
import { TaskService } from "../services/task.service.js";
import { optionalString, requireNonEmptyString, requireOneOf } from "../utils/http/request-validator.util.js";
import { serializeTask, serializeTaskSummary } from "../utils/http/serializer.util.js";
import { actorFromRequest } from "../utils/http/actor.util.js";
import { UnauthorizedError } from "../errors/unauthorized.error.js";
import { TASK_STATUS } from "../data/constants/status.constant.js";
import type { TaskStatus } from "../lib/types/task/task.type.js";

export interface TaskControllerOptions {
  taskService: TaskService;
}

export class TaskController {
  private readonly taskService: TaskService;

  constructor({ taskService }: TaskControllerOptions) {
    this.taskService = taskService;
  }

  createTask = async (req: Request, res: Response): Promise<void> => {
    const sessionId = requireNonEmptyString(req.body, "session_id");

    if (!req.user) throw new UnauthorizedError("Authentication required");

    const task = await this.taskService.create(sessionId, req.user.id);
    res.status(201).json(serializeTask(task));
  };

  getTask = async (req: Request, res: Response): Promise<void> => {
    const task = await this.taskService.get(req.params.id as string);
    res.json(serializeTask(task));
  };

  getNext = async (req: Request, res: Response): Promise<void> => {
    const next = await this.taskService.nextRequirement(req.params.id as string);
    res.json(next);
  };

  setValue = async (req: Request, res: Response): Promise<void> => {
    const key = requireNonEmptyString(req.body, "key");
    const value = (req.body as Record<string, unknown>)?.value ?? null;
    const task = await this.taskService.setValue(req.params.id as string, key, value);
    res.json(serializeTask(task));
  };

  finalizeTask = async (req: Request, res: Response): Promise<void> => {
    const task = await this.taskService.finalize(req.params.id as string);
    res.json(serializeTask(task));
  };

  startTask = async (req: Request, res: Response): Promise<void> => {
    const task = await this.taskService.start(req.params.id as string);
    res.json(serializeTask(task));
  };

  getTaskStatus = async (req: Request, res: Response): Promise<void> => {
    const status = await this.taskService.getStatus(req.params.id as string);
    res.json(status);
  };

  /**
   * The one endpoint in this controller that writes to `res` directly instead
   * of going through a JSON serializer - the response body is the PDF itself.
   */
  getTaskDocument = async (req: Request, res: Response): Promise<void> => {
    const document = await this.taskService.getDocument(req.params.id as string);
    res.setHeader("Content-Type", document.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${document.filename}"`);
    res.setHeader("Content-Length", String(document.byteSize));
    res.send(document.buffer);
  };

  updateStatus = async (req: Request, res: Response): Promise<void> => {
    requireOneOf(req.body, "status", ["cancelled"] as const);
    const task = await this.taskService.cancel(req.params.id as string);
    res.json(serializeTask(task));
  };

  /**
   * `DELETE /tasks/:id` - permanent. Finished tasks qualify, and so does one
   * still collecting details that has never been sent to an approver; the
   * service 409s on anything else rather than orphaning approval links already
   * sitting in inboxes.
   */
  deleteTask = async (req: Request, res: Response): Promise<void> => {
    await this.taskService.delete(req.params.id as string, actorFromRequest(req), req.requestId);
    res.status(204).send();
  };

  /**
   * `portal` callers only ever see their own requests - `created_by` is
   * forced from the authenticated session, never from a client-supplied
   * filter. `admin` is the one audience trusted to list across all requesters.
   */
  listTasks = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError("Authentication required");

    const sessionId = optionalString(req.query, "session_id");
    const status = optionalString(req.query, "status") as TaskStatus | null;
    const filters: { created_by?: string; session_id?: string; status?: TaskStatus } = {};
    if (req.user.audience === "portal") filters.created_by = req.user.id;
    if (sessionId) filters.session_id = sessionId;
    if (status && (Object.values(TASK_STATUS) as string[]).includes(status)) filters.status = status;
    const tasks = await this.taskService.list(filters);
    res.json(tasks.map(serializeTaskSummary));
  };
}
