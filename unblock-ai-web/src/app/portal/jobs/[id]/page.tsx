import { notFound } from "next/navigation";
import { tasksApi } from "@/lib/api/tasks";
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

  let status;
  try {
    status = await tasksApi.status(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return <JobStatusView taskId={id} initialStatus={status} />;
}
