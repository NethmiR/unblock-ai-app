import type { Request } from "express";
import { TASK_FIELD_LIMIT, TaskCreationSource, TaskStatus } from "../../data/constants/task.constant.js";
import { ValidationError } from "../../errors/validation.error.js";
import {
  parseIntegerQuery,
  parseOptionalOneOfQuery,
  parseOptionalStringQuery,
  requireNonEmptyString,
  requireObject,
  requireOneOf,
  requireUuidField,
} from "./request-validator.util.js";
import type { CreateTaskInput, TaskListFilter } from "../../lib/types/task/task-dto.type.js";
import type { FormValuesInput } from "../../lib/types/task/task-form.type.js";

const TASK_CREATION_SOURCES: readonly TaskCreationSource[] = Object.values(TaskCreationSource);
const TASK_STATUSES: readonly TaskStatus[] = Object.values(TaskStatus);

export function parseCreateTaskInput(body: unknown): CreateTaskInput {
  const source = requireOneOf(body, "source", TASK_CREATION_SOURCES);
  switch (source) {
    case TaskCreationSource.SELECTION_SESSION:
      return { source, selectionSessionId: requireNonEmptyString(body, "selection_session_id").trim() };
    case TaskCreationSource.CATALOGUE:
      return { source, workflowTemplateId: requireUuidField(body, "workflow_template_id") };
  }
}

export interface ListWindow {
  search: string | null;
  limit: number;
  offset: number;
}

export function parseListWindow(query: Request["query"]): ListWindow {
  const limit = parseIntegerQuery(query.limit, "limit", TASK_FIELD_LIMIT.LIST_DEFAULT_LIMIT);
  const offset = parseIntegerQuery(query.offset, "offset", 0);
  if (limit < 1 || limit > TASK_FIELD_LIMIT.LIST_MAX_LIMIT) {
    throw new ValidationError(`limit must be between 1 and ${TASK_FIELD_LIMIT.LIST_MAX_LIMIT}`);
  }
  if (offset < 0) throw new ValidationError("offset must not be negative");

  const search = parseOptionalStringQuery(query.search, "search")?.trim() ?? null;
  if (search !== null && search.length > TASK_FIELD_LIMIT.SEARCH_MAX_LENGTH) {
    throw new ValidationError(`search must be at most ${TASK_FIELD_LIMIT.SEARCH_MAX_LENGTH} characters`);
  }
  return { search: search === "" ? null : search, limit, offset };
}

export function parseTaskListFilter(query: Request["query"]): TaskListFilter {
  return { status: parseOptionalOneOfQuery(query.status, "status", TASK_STATUSES), ...parseListWindow(query) };
}

export function parseFormValues(body: unknown): FormValuesInput {
  return requireObject<FormValuesInput>(body, "values");
}
