"use client";
import { useCallback, useState } from "react";
import { tasksApi } from "@/lib/api/tasks";
import { ApiError } from "@/lib/api/client";
import type { NextRequirementDto, RequirementValue, TaskDto, TaskRequirement } from "@/types/task";

/**
 * Drives one requirement-collection loop.
 *
 * Single source of truth for: the task, the requirement being asked for right
 * now, and the in-flight/error state. Components render this and call `submit`;
 * they never talk to the API themselves - the same contract `useSelectionSession`
 * holds for the chat.
 *
 * Seeded from server-fetched data rather than fetching on mount, so there is no
 * loading flash and no mount effect. Every subsequent step of the loop is a
 * client-side mutation.
 *
 * The loop is driven from `GET /tasks/:id/next`, NOT from `task.requirements`.
 * Both are available and rendering the whole array as one form is tempting, but
 * `/next` is what encodes the ordering rule (first pending required, then first
 * pending optional) and - critically - what surfaces follow-up requirements
 * appended after a `request_more_info` decision. A form built from a snapshot of
 * `requirements` would never show them.
 */
export function useTaskCollection(initialTask: TaskDto, initialNext: NextRequirementDto) {
  const [task, setTask] = useState<TaskDto>(initialTask);
  const [current, setCurrent] = useState<TaskRequirement | null>(initialNext.requirement);
  const [complete, setComplete] = useState(initialNext.complete);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set once `start` succeeds - approval mail is out, the loop is over. */
  const [sent, setSent] = useState(false);

  const taskId = initialTask.id;

  const message = (err: unknown, fallback: string) =>
    err instanceof ApiError ? err.message : fallback;

  /**
   * Answers the current requirement and advances.
   *
   * Validation lives on the server: `POST /tasks/:id/values` coerces per
   * `requirement.type` and applies the cross-field date rules against every
   * value collected so far. Re-implementing that here would duplicate
   * `value-validator.util.ts` and drift, so the returned message is rendered
   * as-is - the API names the requirement key in its error text on purpose.
   */
  const submit = useCallback(
    async (value: RequirementValue) => {
      if (!current) return;
      setIsBusy(true);
      setError(null);
      try {
        const updated = await tasksApi.setValue(taskId, current.key, value);
        setTask(updated);
        const next = await tasksApi.next(taskId);
        setCurrent(next.requirement);
        setComplete(next.complete);
      } catch (err) {
        setError(message(err, "Something went wrong saving that answer. Please try again."));
      } finally {
        setIsBusy(false);
      }
    },
    [taskId, current],
  );

  /**
   * Finalize and start, as ONE action.
   *
   * Nothing reaches an approver until the task is `in_progress`, which is
   * exactly the promise the plan panel prints on screen. A task left `ready`
   * but never started is an invisible dead state, so the gap between the two
   * calls is never exposed.
   *
   * `finalize` does NOT always land on `ready`. On a REOPENED task (one an
   * approver returned for more information) the service detects the reopen from
   * the audit trail and goes straight to `in_progress`, dispatching as it goes
   * - see task.service.ts `finalize`, the `isReopen` branch. Calling `start`
   * after that 409s with "not ready to start", which would report a failure for
   * a resend that actually succeeded. So `start` runs only if finalize left the
   * task `ready`.
   */
  const sendForApproval = useCallback(async () => {
    setIsBusy(true);
    setError(null);
    try {
      const finalized = await tasksApi.finalize(taskId);
      const result = finalized.status === "ready" ? await tasksApi.start(taskId) : finalized;
      setTask(result);
      setSent(true);
    } catch (err) {
      setError(message(err, "Something went wrong sending this for approval. Please try again."));
    } finally {
      setIsBusy(false);
    }
  }, [taskId]);

  return { task, current, complete, isBusy, error, sent, submit, sendForApproval };
}
