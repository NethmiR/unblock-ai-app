"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { JobRow, type JobRowTask } from "@/components/portal/JobRow";
import { DeleteRequestDialog } from "@/components/portal/DeleteRequestDialog";
import { EmptyJobs } from "@/components/portal/EmptyJobs";
import { tasksApi } from "@/lib/api/tasks";
import { ApiError } from "@/lib/api/client";

/**
 * The requests list plus the delete flow it owns.
 *
 * The page itself stays a server component - only the dialog state needs the
 * client, so it lives here rather than pushing `"use client"` up to the whole
 * page and giving up the server-side fetch.
 */
export function JobList({ jobs }: { jobs: JobRowTask[] }) {
  const router = useRouter();

  /** The request being deleted, or null when no dialog is open. */
  const [pendingDelete, setPendingDelete] = useState<JobRowTask | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /**
   * `jobs` is a server prop, so a successful delete has to be reflected locally
   * as well as refreshed - `router.refresh()` alone would leave the removed row
   * on screen until the RSC payload arrives.
   */
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  function closeDialog() {
    if (isDeleting) return;
    setPendingDelete(null);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await tasksApi.remove(pendingDelete.id);
      setDeletedIds((ids) => [...ids, pendingDelete.id]);
      setPendingDelete(null);
      router.refresh();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong deleting this request. Please try again.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const visible = jobs.filter((job) => !deletedIds.includes(job.id));

  return (
    <>
      {/* Surfaced here too: a delete that failed after the dialog closed would
          otherwise vanish without explanation. */}
      {deleteError && !pendingDelete && (
        <p className="mb-4 text-[13.5px] text-danger">{deleteError}</p>
      )}

      {/* Deleting the last row empties the list without a re-render from the
          page, so the empty state has to be reachable from here as well. */}
      {visible.length === 0 ? (
        <EmptyJobs />
      ) : (
        <div className="flex flex-col gap-3.5">
          {visible.map((job) => (
            <JobRow key={job.id} job={job} onDelete={setPendingDelete} />
          ))}
        </div>
      )}

      {pendingDelete && (
        <DeleteRequestDialog
          // Keyed so switching rows resets the dialog back to its first stage.
          key={pendingDelete.id}
          reference={pendingDelete.reference}
          title={pendingDelete.workflow_title}
          status={pendingDelete.status}
          busy={isDeleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={closeDialog}
        />
      )}
    </>
  );
}
