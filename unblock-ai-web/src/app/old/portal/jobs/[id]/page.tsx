import { notFound } from "next/navigation";
import { tasksApi } from "@/lib/api/tasks";
import { workflowTemplatesApi } from "@/lib/api/workflow-templates";
import { ApiError } from "@/lib/api/client";
import { JobStatusView } from "@/components/portal/JobStatusView";

export const dynamic = "force-dynamic";

/**
 * The requester's view of one task, driven by `GET /tasks/:id/status` - built
 * for exactly this and not called by anything until now.
 *
 * Also the compatibility path for pre-`requester_email` workflows: their tasks
 * send no requester email, so this page is the only way to track progress.
 */
export default async function JobStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let status, task;
  try {
    [status, task] = await Promise.all([tasksApi.status(id), tasksApi.get(id)]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  /**
   * The plan is supporting detail, not the page: a failed fetch degrades to no
   * plan rather than taking the whole status view down with it.
   */
  const workflow = await workflowTemplatesApi
    .getVersion(task.workflow_template_id, task.workflow_template_version)
    .then(({ version }) => ({ ...version.definition, title: status.workflow_template_title }))
    .catch(() => null);

  return <JobStatusView taskId={id} initialStatus={status} task={task} workflow={workflow} />;
}
