import { notFound } from "next/navigation";
import { tasksApi } from "@/lib/api/tasks";
import { ApiError } from "@/lib/api/client";
import { TaskCollection } from "@/components/portal/TaskCollection";

export const dynamic = "force-dynamic";

/**
 * Requirement collection for one task.
 *
 * Reachable from the creation flow AND from the job list - a task an approver
 * returned for more information comes back to `collecting` and lands here too.
 *
 * Fetches server-side and hands the result down, matching how the admin
 * templates and the approver page load their data.
 */
export default async function CollectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let task, next;
  try {
    [task, next] = await Promise.all([tasksApi.get(id), tasksApi.next(id)]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return <TaskCollection initialTask={task} initialNext={next} />;
}
