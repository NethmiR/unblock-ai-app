import Link from "next/link";
import { JobRow, type JobRowTask } from "@/components/portal/JobRow";
import { Button } from "@/components/ui/Button";
import { tasksApi } from "@/lib/api/tasks";
import { workflowsApi } from "@/lib/api/workflows";

export const dynamic = "force-dynamic";

/**
 * The requester's job list, driven by `GET /tasks` - replaces the
 * `PLACEHOLDER_JOBS` fixture now that the execution engine has shipped.
 *
 * `TaskDto` carries `workflow_id`, not a title, so titles are joined from
 * `workflowsApi.list()` - one extra call for the whole page rather than N
 * calls through the per-task `/status` endpoint.
 */
export default async function JobsPage() {
  const [tasks, workflows] = await Promise.all([tasksApi.list(), workflowsApi.list()]);
  const titleById = new Map(workflows.map((w) => [w.workflow_id, w.title]));
  const jobs: JobRowTask[] = tasks.map((task) => ({
    ...task,
    workflow_title: titleById.get(task.workflow_id) ?? task.workflow_id,
  }));

  return (
    <div className="mx-auto max-w-[1440px] px-16 pb-[120px] pt-14">
      <div className="mb-10 flex items-start justify-between gap-8">
        <div>
          <div className="mb-2.5 text-xs font-medium uppercase tracking-[.14em] text-muted">
            Unblock AI
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">My Requests</h1>
          <p className="mt-2 max-w-[52ch] text-[15px] text-muted">
            View and track all your requests.
          </p>
        </div>
        <Link href="/portal/jobs/new" className="flex-none">
          <Button className="h-[50px] rounded-card px-[22px] text-[15px] font-medium">
            New Request
          </Button>
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center rounded-card border border-line bg-surface px-10 py-20 text-center">
          <div className="mb-6 h-14 w-14 rounded-card border border-dashed border-slate-300" />
          <div className="text-xl font-semibold tracking-tight">Nothing in progress yet</div>
          <p className="mb-7 mt-2.5 max-w-[44ch] text-[15px] text-muted">
            Start by describing what you need — overseas leave, a verification letter, a hall booking.
            We&apos;ll work out who has to approve it.
          </p>
          <Link href="/portal/jobs/new">
            <Button className="h-[50px] rounded-card px-[22px] text-[15px] font-medium">
              New Request
            </Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
