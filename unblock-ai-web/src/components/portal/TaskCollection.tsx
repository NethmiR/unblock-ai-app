"use client";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RequirementField } from "./RequirementField";
import { useTaskCollection } from "@/lib/hooks/useTaskCollection";
import type { NextRequirementDto, TaskDto } from "@/types/task";

/** A `followup:<step_id>:<n>` key means an approver asked this question. */
const isFollowUp = (key: string) => key.startsWith("followup:");

/**
 * The requirement-collection view for one task.
 *
 * Serves BOTH entry points, because the API makes no distinction between them:
 * a brand-new task and a live task an approver sent back for more information
 * are both `status: "collecting"`. Routing keys off the status, never off how
 * the user arrived here.
 */
export function TaskCollection({
  initialTask,
  initialNext,
}: {
  initialTask: TaskDto;
  initialNext: NextRequirementDto;
}) {
  const { task, current, complete, isBusy, error, sent, submit, sendForApproval } =
    useTaskCollection(initialTask, initialNext);

  const answered = task.requirements.filter((r) => r.status !== "pending").length;
  const total = task.requirements.length;

  return (
    <div className="mx-auto max-w-[720px] px-6 py-14">
      <div className="mb-2 text-xs font-medium uppercase tracking-[.14em] text-muted">
        {task.reference}
      </div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        {sent ? "Sent for approval" : "A few more details"}
      </h1>
      {!sent && total > 0 && (
        <p className="mb-8 text-[14.5px] text-muted">
          {answered} of {total} answered
        </p>
      )}

      {sent ? (
        <Card className="px-7 py-6">
          <p className="text-[14.5px] text-ink">
            Your request is on its way to the first approver. You can track it from your requests
            list.
          </p>
          {/* Links to the list, not to /portal/jobs/[id] - that route does not
              exist until Phase 5.3 builds the per-task status view. */}
          <Link href="/portal" className="mt-5 inline-block">
            <Button className="h-[46px] rounded-card px-[22px] text-[15px] font-medium">
              Back to my requests
            </Button>
          </Link>
        </Card>
      ) : current ? (
        <Card className="px-7 py-7">
          {isFollowUp(current.key) && (
            <p className="mb-4 text-[13px] font-semibold uppercase tracking-[.08em] text-warn-ink">
              An approver asked for more information
            </p>
          )}
          {/* Keyed so each requirement gets a fresh, blank control. */}
          <RequirementField
            key={current.key}
            requirement={current}
            isBusy={isBusy}
            onSubmit={submit}
          />
          {error && <p className="mt-4 text-[13.5px] text-danger">{error}</p>}
        </Card>
      ) : complete ? (
        <Card className="px-7 py-7">
          <div className="mb-1.5 text-[15px] font-semibold tracking-tight">
            That is everything we need
          </div>
          <p className="mb-6 max-w-[46ch] text-[13.5px] leading-relaxed text-muted">
            Nothing has been sent to any approver yet. Sending will notify the first approver by
            email.
          </p>
          {error && <p className="mb-4 text-[13.5px] text-danger">{error}</p>}
          {/* Finalize and start, deliberately as one action - see useTaskCollection. */}
          <Button
            onClick={sendForApproval}
            disabled={isBusy}
            className="h-[48px] rounded-card px-[22px] text-[15px] font-medium"
          >
            {isBusy ? "Sending…" : "Send for approval"}
          </Button>
        </Card>
      ) : (
        // `/next` reports neither a requirement nor completion: the task has
        // moved on from `collecting` (already sent, cancelled, or decided).
        <Card className="px-7 py-6">
          <p className="text-[14.5px] text-ink">
            This request is not collecting information right now.
          </p>
          <Link href="/portal" className="mt-4 inline-block text-[14px] font-medium">
            Back to my requests
          </Link>
        </Card>
      )}
    </div>
  );
}
