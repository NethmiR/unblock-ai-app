"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { draftsApi } from "@/lib/api/drafts";
import { workflowsApi } from "@/lib/api/workflows";
import { deriveEditorState, ctaFor } from "@/lib/workflow/editorState";
import { countWords } from "@/lib/utils/format";
import { DraftEditor } from "./DraftEditor";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
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
  /** Empty for a template that has never been compiled - the heading shows a placeholder. */
  initialTitle?: string;
}

/** Mirrors MAX_TITLE_LENGTH in the API's WorkflowService - keep the two in step. */
const TITLE_MAX_LENGTH = 200;

/** Shown in the field AND measured by its sizer, so it has to be one string. */
const TITLE_PLACEHOLDER = "Untitled template";

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
  initialReviewStatus = null, initialVersion = null, initialTitle = "",
}: Props) {
  const [text, setText] = useState(initialText);
  const [title, setTitle] = useState(initialTitle);
  /**
   * The title the SERVER currently holds - not the one being typed. Keeping the
   * two apart is what lets a failed rename put the heading back rather than
   * leaving it showing a name that was never saved.
   */
  const [savedTitle, setSavedTitle] = useState(initialTitle);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [wasRenamed, setWasRenamed] = useState(false);
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
  const [isRenaming, startRenaming] = useTransition();
  const [isSlowCompile, setIsSlowCompile] = useState(false);
  const [lastAttempts, setLastAttempts] = useState<number | null>(null);
  const router = useRouter();

  const state = deriveEditorState({ text, hasCompiled: workflow !== null, compiledFromText });
  const cta = ctaFor(state);

  // Distinguishes a slow compile from a hung one. A single timer keyed off
  // the existing useTransition pending flag - no polling, no new requests.
  useEffect(() => {
    if (!isGenerating) {
      setIsSlowCompile(false);
      return;
    }
    const timer = setTimeout(() => setIsSlowCompile(true), 8000);
    return () => clearTimeout(timer);
  }, [isGenerating]);

  /**
   * Commits the title currently in the heading.
   *
   * For a template that exists on the server this is a real write - a rename
   * re-embeds the row, so it cannot be deferred until the next compile without
   * leaving search matching the old name. For one that has never compiled there
   * is nothing to rename yet, so the title is simply held and handed to
   * `generate` as the override.
   */
  function commitTitle() {
    const next = title.trim().replace(/\s+/g, " ");
    setRenameError(null);

    // An emptied heading is a mistake, not a request to have no name.
    if (!next) {
      setTitle(savedTitle);
      return;
    }
    if (next === savedTitle) {
      setTitle(next);   // collapse stray whitespace, but do not call the API
      return;
    }

    setTitle(next);
    if (!workflow) {
      setSavedTitle(next);
      return;
    }

    startRenaming(async () => {
      try {
        const summary = await workflowsApi.rename(
          workflow.workflow_id,
          next,
          version ?? undefined,
        );
        setSavedTitle(summary.title);
        setTitle(summary.title);
        setWorkflow((current) => (current ? { ...current, title: summary.title } : current));
        setWasRenamed(true);
        // The list reads titles from a cached RSC payload; without this the
        // template still shows its old name on the way back.
        router.refresh();
      } catch (err) {
        setRenameError(
          err instanceof ApiError ? err.message : "Something went wrong while renaming the template.",
        );
        setTitle(savedTitle);
      }
    });
  }

  /**
   * Persists the prose WITHOUT compiling it. This is the escape hatch for a
   * half-written workflow the admin wants to come back to - extraction is slow
   * and would fail on incomplete text anyway.
   */
  async function saveDraft() {
    setError(null);
    startSaving(async () => {
      try {
        const draft = await draftsApi.create(text, title.trim() || undefined);
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
    setLastAttempts(null);
    startGenerating(async () => {
      try {
        // Save the draft first so the raw text survives even if extraction fails.
        // `create` is idempotent by content hash, so re-generating identical
        // text does not pile up duplicate drafts.
        const draft = await draftsApi.create(text, title.trim() || undefined);
        setDraftId(draft.id);
        setSavedText(text);

        // The title goes with the request. The model would otherwise infer a
        // fresh one from the prose and quietly undo any rename made here.
        const result = await draftsApi.extract(draft.id, title.trim() || undefined);
        setWorkflow(result.workflow);
        setCompiledFromText(text);
        setReviewStatus(result.review_status);
        setVersion(result.version);
        setLastAttempts(result.attempts);
        setTitle(result.workflow.title);
        setSavedTitle(result.workflow.title);
        setWasRenamed(false);
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
        // Invalidates the cached RSC payload for /admin so the list's badge
        // reflects this change on the next visit, without ever caching the
        // always-fresh `getRecord`/list reads themselves (see client.ts).
        router.refresh();
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
        {/* `min-w-0` so a long title wraps inside this column instead of
            widening it and pushing the actions off the row. */}
        <div className="min-w-0 flex-1">
          <a href="/admin" className="mb-2.5 inline-flex items-center gap-2.5 text-[14.5px] font-medium text-muted transition-colors hover:text-ink">
            <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M11 3.5L5.5 9l5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            See other templates
          </a>
          <TitleField
            value={title}
            onChange={setTitle}
            onCommit={commitTitle}
            onCancel={() => setTitle(savedTitle)}
          />
          {/* The rename indicator lives here, not beside the title: anything
              rendered next to the field steals width from it and re-wraps the
              title mid-save. This row already changes content. */}
          <div className="mt-[7px] flex items-center gap-2 text-xs text-muted">
            {workflow ? `Compiled · ${workflow.steps.length} steps` : "Draft · not yet compiled"}
            {reviewStatus && <ReviewStatusBadge status={reviewStatus} />}
            {isRenaming && <span>· Renaming…</span>}
          </div>
        </div>

        <div className="flex flex-none items-center gap-3.5">
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

      {renameError && (
        <div className="mb-4 rounded-control border border-danger/40 bg-danger/5 px-4 py-3 text-[13px] text-ink">
          {renameError}
        </div>
      )}

      {wasRenamed && !renameError && <RenamedNotice />}

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
              {!isGenerating && lastAttempts !== null && lastAttempts > 1 && (
                <> · Compiled after {lastAttempts} attempts</>
              )}
            </span>
          </header>

          {isGenerating ? (
            <CompilingPlaceholder isSlow={isSlowCompile} />
          ) : workflow ? (
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

/**
 * Every metric that decides where a line breaks.
 *
 * The sizer and the field are measured against each other, so anything that
 * moves a line break has to appear on BOTH: font, size, weight, tracking,
 * leading, padding, and the border width that box-sizing folds into the
 * content box. A value on only one of them makes the box the wrong height for
 * the text sitting in it.
 */
const TITLE_METRICS =
  "border border-transparent px-2 py-0.5 text-[22px] font-bold leading-[1.28] tracking-tight break-words";

/**
 * The heading, as an editable field that grows to fit the whole title.
 *
 * A `<textarea>`, not an `<input>`: an input is a single-line control by
 * definition, so a title wider than the box scrolls inside it and the admin is
 * left reading a window onto the middle of their own text. A title is still
 * logically one line - Enter commits instead of inserting a newline, and a
 * pasted multi-line string is flattened - the textarea is here purely because
 * it is the only native field that wraps.
 *
 * Height comes from the hidden sizer stacked in the same grid cell, not from
 * measuring `scrollHeight` in an effect. Both hold the same text under the same
 * metrics, so the grid row is exactly as tall as the wrapped title at every
 * width - no layout effect, no resize listener, and nothing that can render at
 * the wrong height on the server and jump after hydration.
 *
 * Escape is routed through a ref, not through state. Reverting the value and
 * blurring in the same handler means the blur reads whatever the pre-revert
 * render closed over - a flag the blur handler checks is the only version of
 * this that cannot commit the value the user just abandoned.
 */
function TitleField({
  value, onChange, onCommit, onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const cancelled = useRef(false);

  return (
    <div className="-ml-2 grid grid-cols-1">
      {/*
        Sizes the grid row and nothing else. The trailing space keeps the box
        from tightening around a title the admin has just ended with one, which
        would otherwise pull the caret onto the previous line as they type it.
      */}
      <span
        aria-hidden
        className={`invisible col-start-1 row-start-1 whitespace-pre-wrap ${TITLE_METRICS}`}
      >
        {value || TITLE_PLACEHOLDER}{" "}
      </span>

      <textarea
        value={value}
        rows={1}
        onChange={(e) => onChange(flattenTitle(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();   // a title is one line - commit, never break
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (cancelled.current) {
            cancelled.current = false;
            onCancel();
            return;
          }
          onCommit();
        }}
        placeholder={TITLE_PLACEHOLDER}
        aria-label="Template title"
        maxLength={TITLE_MAX_LENGTH}
        spellCheck={false}
        className={`col-start-1 row-start-1 resize-none overflow-hidden rounded-control bg-transparent text-ink outline-none transition-colors placeholder:font-semibold placeholder:text-faint hover:border-line-admin focus:border-accent focus:bg-surface ${TITLE_METRICS}`}
      />
    </div>
  );
}

/**
 * Flattens a title pasted out of a document into the single line the field, the
 * list, and the delete confirmation all assume it is.
 *
 * Newlines ONLY. Collapsing every run of whitespace here would rewrite the
 * value mid-typing, and a controlled field whose value comes back different
 * from what the DOM holds drops the caret to the end - so typing a space beside
 * an existing one would throw the cursor out of the middle of the title.
 * Enter never inserts a break, so this can only ever fire on a paste, where the
 * caret has nowhere meaningful to be anyway. The remaining tidy-up (runs of
 * spaces, leading and trailing) happens once, on commit.
 */
function flattenTitle(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}

/**
 * Says what a rename did and, more usefully, what it did not do.
 *
 * The compiled graph is untouched and search has already been re-indexed on the
 * new name - so there is nothing the admin MUST do. But the aliases and
 * keywords the requester-facing search also matches on were written by the
 * model from the prose on the left, and still describe the old process. When
 * the rename was a real change of what this workflow is, that prose needs
 * editing and the template regenerating; when it was a wording fix, it does not.
 * Only the admin can tell those apart, so this states the trade-off instead of
 * forcing a recompile.
 */
function RenamedNotice() {
  return (
    <div className="mb-4 rounded-control border border-warn-border bg-warn-bg px-4 py-3 text-[13px] leading-normal text-warn-ink">
      <span className="font-semibold">Renamed.</span> The compiled workflow is unchanged and search
      already follows the new name. If the process itself is now different, edit the description on
      the left and regenerate — the search aliases and keywords still come from the original text.
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

function CompilingPlaceholder({ isSlow }: { isSlow: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[18px] bg-[repeating-linear-gradient(135deg,rgba(71,85,105,.035)_0_8px,transparent_8px_16px)]">
      <Spinner />
      <p className="max-w-[34ch] text-center text-[12.5px] text-muted">
        {isSlow
          ? "Still compiling — long workflows can take a little longer."
          : "Compiling your workflow…"}
      </p>
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
