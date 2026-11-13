import type { Request, Response } from "express";
import { requireAuthContext } from "../utils/http/auth-context.util.js";
import { actorFromRequest } from "../utils/http/actor.util.js";
import { parseCreateTaskInput, parseTaskListFilter } from "../utils/http/task-request.util.js";
import { serializeTask, serializeTaskList, type TaskSerializationOptions } from "../utils/http/task-serializer.util.js";
import { TaskStatus } from "../data/constants/task.constant.js";
import { taskTranscriptUnavailable } from "../errors/task.error.js";
import type { TaskService } from "../services/task.service.js";
import type { TaskTranscriptService } from "../services/task-transcript.service.js";
import type { TaskDocument } from "../lib/types/task/task-document.type.js";
import type { TaskDto } from "../lib/types/task/task-dto.type.js";

export interface TaskControllerOptions {
  taskService: Pick<TaskService, "create" | "get" | "list" | "getWorkflowDefinition" | "cancel" | "delete">;
  serialization: TaskSerializationOptions;
  transcriptService: Pick<TaskTranscriptService, "renderForTask">;
}

const CONTENT_TYPE_HEADER = "Content-Type";
const CONTENT_DISPOSITION_HEADER = "Content-Disposition";

export function taskIdOf(req: Request): string {
  return String(req.params.id);
}

export class TaskController {
  private readonly taskService: TaskControllerOptions["taskService"];
  private readonly serialization: TaskSerializationOptions;
  private readonly transcriptService: Pick<TaskTranscriptService, "renderForTask">;

  constructor({ taskService, serialization, transcriptService }: TaskControllerOptions) {
    this.taskService = taskService;
    this.serialization = serialization;
    this.transcriptService = transcriptService;
  }

  toDto(task: TaskDocument): TaskDto {
    return serializeTask(task, this.serialization);
  }

  createTask = async (req: Request, res: Response): Promise<void> => {
    const input = parseCreateTaskInput(req.body);
    const task = await this.taskService.create(requireAuthContext(req).user.id, input);
    res.status(201).json(this.toDto(task));
  };

  listTasks = async (req: Request, res: Response): Promise<void> => {
    const filter = parseTaskListFilter(req.query);
    const page = await this.taskService.list(requireAuthContext(req).user.id, filter);
    res.json(serializeTaskList(page, filter.limit, filter.offset));
  };

  getTask = async (req: Request, res: Response): Promise<void> => {
    res.json(this.toDto(await this.taskService.get(taskIdOf(req))));
  };

  getWorkflowDefinition = async (req: Request, res: Response): Promise<void> => {
    res.json({ definition: await this.taskService.getWorkflowDefinition(taskIdOf(req)) });
  };

  cancelTask = async (req: Request, res: Response): Promise<void> => {
    res.json(this.toDto(await this.taskService.cancel(taskIdOf(req))));
  };

  getTranscript = async (req: Request, res: Response): Promise<void> => {
    const task = await this.taskService.get(taskIdOf(req));
    if (task.status !== TaskStatus.COMPLETED) throw taskTranscriptUnavailable();
    const transcript = await this.transcriptService.renderForTask(task);
    if (transcript === null) throw taskTranscriptUnavailable();
    res.setHeader(CONTENT_TYPE_HEADER, transcript.contentType);
    res.setHeader(CONTENT_DISPOSITION_HEADER, `attachment; filename="${transcript.filename}"`);
    res.send(transcript.buffer);
  };

  deleteTask = async (req: Request, res: Response): Promise<void> => {
    await this.taskService.delete(taskIdOf(req), actorFromRequest(req), req.requestId ?? null);
    res.status(204).end();
  };
}
