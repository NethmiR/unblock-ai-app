"use client";
import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { draftsApi } from "@/lib/api/drafts";
import { workflowsApi } from "@/lib/api/workflows";
import { deriveEditorState, ctaFor } from "@/lib/workflow/editorState";
import { countWords } from "@/lib/utils/format";
import { DraftEditor } from "./DraftEditor";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api/client";
import type { ReviewStatus, Workflow } from "@/types/workflow";

/**
 * Deferred: React Flow measures the DOM, so it cannot server-render, and it is
 * the heaviest dependency on this route. The skeleton reuses InertPlaceholder's
 * box so deferring it does not shift the layout when it mounts.
 */
const WorkflowFlowchart = dynamic(
  () => import("./flowchart/WorkflowFlowchart").then((m) => m.WorkflowFlowchart),
  { ssr: false, loading: () => <FlowchartSkeleton /> },
);

interface Props {
  initialText?: string;
  initialWorkflow?: Workflow | null;
  initialDraftId?: string | null;
  initialReviewStatus?: ReviewStatus | null;
  initialVersion?: number | null;
  documentTitle: string;
}

const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  pending_admin_review: "Pending review",
  confirmed: "Published",
  rejected: "Rejected",
};

/**
 * Owns the editor's state machine and the generate action.
 *
 * Everything visual is delegated to child components; this file holds only
 * state and the one async operation. That separation is what keeps the state
 * machine readable.
 */
export function TemplateEditor({
  initialText = "", initialWorkflow = null, initialDraftId = null,
  initialReviewStatus = null, initialVersion = null, documentTitle,
}: Props) {
  const [text, setText] = useState(initialText);
  const [workflow, setWorkflow] = useState<Workflow | null>(initialWorkflow);
  const [compiledFromText, setCompiledFromText] = useState<string | null>(
    initialWorkflow ? initialText : null,
  );
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus | null>(initialReviewStatus);
  const [version, setVersion] = useState<number | null>(initialVersion);
  const [error, setError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [savedText, setSavedText] = useState<string | null>(initialText || null);
  const [isGenerating, startGenerating] = useTransition();
  const [isPublishing, startPublishing] = useTransition();
  const [isSaving, startSaving] = useTransition();

  const state = deriveEditorState({ text, hasCompiled: workflow !== null, compiledFromText });
  const cta = ctaFor(state);

  /**
   * Persists the prose WITHOUT compiling it. This is the escape hatch for a
   * half-written workflow the admin wants to come back to - extraction is slow
   * and would fail on incomplete text anyway.
   */
  async function saveDraft() {
    setError(null);
    startSaving(async () => {
      try {
        const draft = await draftsApi.create(text, documentTitle);
        setDraftId(draft.id);
        setSavedText(text);
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Something went wrong while saving the draft.",
        );
      }
    });
  }

  async function generate() {
    setError(null);
    startGenerating(async () => {
      try {
        // Save the draft first so the raw text survives even if extraction fails.
        // `create` is idempotent by content hash, so re-generating identical
        // text does not pile up duplicate drafts.
        const draft = await draftsApi.create(text, documentTitle);
        setDraftId(draft.id);
        setSavedText(text);

        const result = await draftsApi.extract(draft.id);
        setWorkflow(result.workflow);
        setCompiledFromText(text);
        setReviewStatus(result.review_status);
        setVersion(result.version);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Something went wrong while compiling the template.",
        );
      }
    });
  }

  async function publish() {
    if (!workflow) return;
    setPublishError(null);
    startPublishing(async () => {
      try {
        const summary = await workflowsApi.setReviewStatus(
          workflow.workflow_id,
          "confirmed",
          version ?? undefined,
        );
        setReviewStatus(summary.review_status);
        setVersion(summary.version);
      } catch (err) {
        setPublishError(
          err instanceof ApiError
            ? err.message
            : "Something went wrong while publishing the template.",
        );
      }
    });
  }

  return (
    <div className="px-7 pt-5">
      <div className="mb-4 flex items-end justify-between gap-7">
        <div>
          <a href="/admin" className="mb-2.5 inline-flex items-center gap-[7px] text-[12.5px] text-muted hover:text-ink">
            <span className="text-[13px]">←</span>See other templates
          </a>
          <h1 className="text-[22px] font-bold tracking-tight">{documentTitle}</h1>
          <div className="mt-[7px] flex items-center gap-2 text-xs text-muted">
            {workflow ? `Compiled · ${workflow.steps.length} steps` : "Draft · not yet compiled"}
            {reviewStatus && <ReviewStatusBadge status={reviewStatus} />}
          </div>
        </div>

        <div className="flex items-center gap-3.5">
          {state === "edited" && (
            <span className="text-xs text-muted">Text edited since last compile</span>
          )}
          <Button
            variant="secondary"
            onClick={saveDraft}
            disabled={text.trim() === "" || isSaving || text === savedText}
          >
            {isSaving ? "Saving…" : text === savedText ? "Saved" : "Save draft"}
          </Button>
          <Button onClick={generate} disabled={!cta.enabled || isGenerating}>
            {isGenerating ? "Compiling…" : cta.label}
          </Button>
          {workflow && reviewStatus !== "confirmed" && (
            <Button onClick={publish} disabled={isPublishing || state === "edited"}>
              {isPublishing ? "Publishing…" : "Publish"}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-control border border-danger/40 bg-danger/5 px-4 py-3 text-[13px] text-ink">
          {error}
        </div>
      )}

      {publishError && (
        <div className="mb-4 rounded-control border border-danger/40 bg-danger/5 px-4 py-3 text-[13px] text-ink">
          {publishError}
        </div>
      )}

      <div className="grid grid-cols-2 items-stretch gap-5">
        <DraftEditor value={text} onChange={setText} state={state} wordCount={countWords(text)} />

        <section className="flex h-[calc(100vh-200px)] min-h-[520px] flex-col overflow-hidden rounded-card border border-line-admin bg-surface">
          <header className="flex items-center justify-between border-b border-line-admin px-[18px] py-[13px]">
            <span className="text-[11px] font-bold uppercase tracking-[.07em] text-muted">
              Generated Workflow
            </span>
            <span className="text-[11.5px] text-muted">
              {workflow ? `Read-only · ${workflow.steps.length} steps` : "Read-only"}
            </span>
          </header>

          {workflow ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              {state === "edited" && <StaleBanner />}
              <div className="flex-1">
                <WorkflowFlowchart workflow={workflow} />
              </div>
            </div>
          ) : (
            <InertPlaceholder hasText={text.trim() !== ""} />
          )}
        </section>
      </div>
    </div>
  );
}

const REVIEW_STATUS_TONE: Record<ReviewStatus, string> = {
  pending_admin_review: "border-warn/40 bg-warn/10 text-ink",
  confirmed: "border-success/40 bg-success/10 text-ink",
  rejected: "border-danger/40 bg-danger/10 text-ink",
};

function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  return (
    <span
      className={`rounded-full border px-2 py-[1px] text-[10.5px] font-semibold uppercase tracking-[.04em] ${REVIEW_STATUS_TONE[status]}`}
    >
      {REVIEW_STATUS_LABEL[status]}
    </span>
  );
}

function StaleBanner() {
  // A row above the canvas, not an overlay on top of it - `fitView` recentres
  // the graph on every render, so a floating banner pinned to a fixed screen
  // position will eventually land on whatever node ends up there.
  return (
    <div className="border-b border-dashed border-warn/60 bg-warn/10 px-[15px] py-[11px] text-center text-xs leading-normal text-muted">
      Edit not yet compiled — the flowchart still shows the previous version.
    </div>
  );
}

function FlowchartSkeleton() {
  return (
    <div className="flex flex-1 animate-pulse flex-col items-center justify-center gap-[18px] bg-[repeating-linear-gradient(135deg,rgba(71,85,105,.025)_0_8px,transparent_8px_16px)]">
      <div className="flex flex-col items-center gap-[9px] opacity-55">
        {[0, 1, 2].map((i) => (
          <div key={i} className="contents">
            <div className="h-[34px] w-[132px] rounded-[9px] border border-dashed border-line-admin" />
            {i < 2 && <div className="h-4 w-px bg-line-admin" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function InertPlaceholder({ hasText }: { hasText: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[18px] bg-[repeating-linear-gradient(135deg,rgba(71,85,105,.035)_0_8px,transparent_8px_16px)]">
      <div className="flex flex-col items-center gap-[9px] opacity-55">
        {[0, 1, 2].map((i) => (
          <div key={i} className="contents">
            <div className="h-[34px] w-[132px] rounded-[9px] border border-dashed border-line-admin" />
            {i < 2 && <div className="h-4 w-px bg-line-admin" />}
          </div>
        ))}
      </div>
      <p className="max-w-[34ch] text-center text-[12.5px] text-muted">
        {hasText
          ? "Nothing compiled yet. Generate the template to see how Unblock AI read your workflow."
          : "The compiled flowchart will appear here once you write your workflow and generate the template."}
      </p>
    </div>
  );
}
