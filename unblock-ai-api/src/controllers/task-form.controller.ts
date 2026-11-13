import type { Request, Response } from "express";
import { parseFormValues } from "../utils/http/task-request.util.js";
import { serializeTask, type TaskSerializationOptions } from "../utils/http/task-serializer.util.js";
import { taskIdOf } from "./task.controller.js";
import type { TaskFormService } from "../services/task-form.service.js";

export interface TaskFormControllerOptions {
  taskFormService: Pick<TaskFormService, "saveDraft" | "submit">;
  serialization: TaskSerializationOptions;
}

function formIdOf(req: Request): string {
  return String(req.params.formId);
}

export class TaskFormController {
  private readonly taskFormService: TaskFormControllerOptions["taskFormService"];
  private readonly serialization: TaskSerializationOptions;

  constructor({ taskFormService, serialization }: TaskFormControllerOptions) {
    this.taskFormService = taskFormService;
    this.serialization = serialization;
  }

  saveDraft = async (req: Request, res: Response): Promise<void> => {
    const task = await this.taskFormService.saveDraft(taskIdOf(req), formIdOf(req), parseFormValues(req.body));
    res.json(serializeTask(task, this.serialization));
  };

  submit = async (req: Request, res: Response): Promise<void> => {
    const task = await this.taskFormService.submit(taskIdOf(req), formIdOf(req), parseFormValues(req.body));
    res.json(serializeTask(task, this.serialization));
  };
}
