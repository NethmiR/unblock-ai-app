import type { Request, Response } from "express";
import { TaskService } from "../services/task.service.js";
import { optionalString, requireNonEmptyString, requireOneOf } from "../utils/http/request-validator.util.js";
import { serializeTask, serializeTaskSummary } from "../utils/http/serializer.util.js";
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
    const task = await this.taskService.create(sessionId);
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

  updateStatus = async (req: Request, res: Response): Promise<void> => {
    requireOneOf(req.body, "status", ["cancelled"] as const);
    const task = await this.taskService.cancel(req.params.id as string);
    res.json(serializeTask(task));
  };

  listTasks = async (req: Request, res: Response): Promise<void> => {
    const sessionId = optionalString(req.query, "session_id");
    const status = optionalString(req.query, "status") as TaskStatus | null;
    const filters: { session_id?: string; status?: TaskStatus } = {};
    if (sessionId) filters.session_id = sessionId;
    if (status && (Object.values(TASK_STATUS) as string[]).includes(status)) filters.status = status;
    const tasks = await this.taskService.list(filters);
    res.json(tasks.map(serializeTaskSummary));
  };
}
