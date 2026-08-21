"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { TemplateRow } from "./TemplateRow";
import { DeleteTemplateDialog } from "./DeleteTemplateDialog";
import { workflowsApi } from "@/lib/api/workflows";
import { ApiError } from "@/lib/api/client";
import type { WorkflowSummary } from "@/types/workflow";

const SEGMENTS = ["All", "Published", "Drafts"] as const;
type Segment = (typeof SEGMENTS)[number];

/**
 * Search + review-status filtering over an already-fetched template list.
 *
 * This filters CLIENT-SIDE on purpose. `GET /workflows` caps at 50 rows and
 * exposes only an `institution_type` query param - there is no server-side
 * text search or review_status filter to delegate to, and re-fetching on every
 * keystroke would buy nothing. If the list ever outgrows the 50-row cap this
 * has to become a server query.
 */
export function TemplateFilters({ templates }: { templates: WorkflowSummary[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("All");

  /** The template the admin is deleting, or null when no dialog is open. */
  const [pendingDelete, setPendingDelete] = useState<WorkflowSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /**
   * `templates` is a server prop, so a successful delete has to be reflected
   * locally as well as refreshed - `router.refresh()` alone would leave the
   * removed row on screen until the RSC payload arrives.
   */
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  function closeDeleteDialog() {
    if (isDeleting) return;
    setPendingDelete(null);
    setDeleteError(null);
  }

  async function confirmDelete(confirmation: string, confirmTitle: string) {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await workflowsApi.remove(pendingDelete.workflow_id, confirmation, confirmTitle);
      setDeletedIds((ids) => [...ids, pendingDelete.workflow_id]);
      setPendingDelete(null);
      router.refresh();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong deleting this template. Please try again.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (deletedIds.includes(t.workflow_id)) return false;

      // "Drafts" is everything not yet confirmed - `rejected` included, since a
      // rejected template is still unpublished work the admin has to act on.
      const matchesSegment =
        segment === "All" ||
        (segment === "Published" ? t.review_status === "confirmed" : t.review_status !== "confirmed");

      if (!matchesSegment) return false;
      if (needle === "") return true;

      return (
        t.title.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle)
      );
    });
  }, [templates, query, segment, deletedIds]);

  const total = templates.length - deletedIds.length;

  return (
    <>
      <div className="mb-[18px] flex items-center gap-3">
        <div className="flex h-[38px] flex-1 items-center gap-2.5 rounded-control border border-line-admin bg-surface px-3.5">
          <span className="text-[13px] text-muted">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates, departments or approvers"
            className="flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-muted"
          />
        </div>

        <div className="flex items-center overflow-hidden rounded-control border border-line-admin bg-surface">
          {SEGMENTS.map((s, i) => (
            <button
              key={s}
              onClick={() => setSegment(s)}
              className={cn(
                "flex h-[38px] items-center px-3.5 text-[12.5px] transition-colors",
                i > 0 && "border-l border-line-admin",
                segment === s ? "bg-slate-100 font-semibold text-ink" : "text-muted hover:text-ink",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-line-admin bg-surface">
        {visible.length === 0 ? (
          <div className="px-[22px] py-12 text-center text-[13px] text-muted">
            {/* An emptied list is not a failed search - saying "no matches" after
                deleting the last template would misread as a filtering problem. */}
            {total === 0
              ? "No templates left. Create one to get started."
              : `No templates match “${query.trim() || segment.toLowerCase()}”.`}
          </div>
        ) : (
          visible.map((t) => (
            <TemplateRow key={t.workflow_id} template={t} onDelete={setPendingDelete} />
          ))
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted">
        <span>
          Showing {visible.length} of {total} template
          {total === 1 ? "" : "s"}
        </span>
      </div>

      {pendingDelete && (
        <DeleteTemplateDialog
          // Keyed so switching rows resets the dialog back to step one.
          key={pendingDelete.workflow_id}
          title={pendingDelete.title}
          busy={isDeleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={closeDeleteDialog}
        />
      )}
    </>
  );
}
