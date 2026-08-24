import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import type { PlanNode as PlanNodeData } from "@/lib/workflow/toPlanNodes";

interface Props {
  node: PlanNodeData;
  isLast: boolean;
  /**
   * Runs the node's `action`. Optional, and the button appears only when BOTH
   * this and `node.action` are present - the plan is drawn read-only in places
   * that have no task to act on (the new-request page), and a button there
   * would have nothing to do.
   */
  onAction?: () => void;
}

/** The connector rendered between nodes: a short vertical line plus a chevron. */
function Connector() {
  return (
    <div className="flex flex-col items-center py-0.5">
      <div className="h-[26px] w-px bg-line-admin" />
      <svg width="10" height="7" viewBox="0 0 10 7" fill="none" aria-hidden>
        <path
          d="M1 1l4 4 4-4"
          stroke="#CBD5E1"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function DoneNode({ node }: { node: PlanNodeData }) {
  return (
    <div className="flex items-start gap-3.5 rounded-card border border-line bg-surface px-[18px] py-4">
      <div className="mt-px flex h-6 w-6 flex-none items-center justify-center rounded-full bg-success">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3.5 8.4l3 3 6-6.8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-ink">{node.label}</div>
        <div className="mt-[3px] text-[13.5px] text-muted">{node.sub}</div>
        {node.meta && <div className="mt-[7px] text-[12.5px] font-medium text-success">{node.meta}</div>}
      </div>
    </div>
  );
}

function CurrentNode({ node, onAction }: { node: PlanNodeData; onAction?: () => void }) {
  return (
    <div className="rounded-card border-2 border-warn bg-surface p-5 shadow-[0_6px_20px_rgba(245,158,11,.20)]">
      <div className="flex items-start gap-3.5">
        {/* A queued node (one carrying its own eyebrow, e.g. "Coming next")
            gets a static ring: a spinner reads as work already underway. */}
        {node.eyebrow ? (
          <div className="mt-px h-6 w-6 flex-none rounded-full border-2 border-warn" />
        ) : (
          <Spinner size={24} />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.12em] text-warn-ink">
            {node.eyebrow ?? "Current step"}
          </div>
          <div className="text-[17px] font-semibold tracking-tight text-ink">{node.label}</div>
          <div className="mt-1 text-sm text-muted">{node.sub}</div>

          {node.inputs.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5 pl-[18px]">
              {node.inputs.map((input) => (
                <li key={input} className="list-disc text-[13.5px] leading-normal text-ink">
                  {input}
                </li>
              ))}
            </ul>
          )}

          {node.note && (
            <div className="mt-[13px] rounded-lg bg-bg px-3 py-[9px] text-[12.5px] leading-normal text-muted">
              {node.note}
            </div>
          )}

          {node.meta && <div className="mt-[13px] text-[12.5px] font-medium text-warn-ink">{node.meta}</div>}

          {/* The step's own call to action, in the step that is waiting on it -
              so the plan is read and answered in one place. */}
          {node.action && onAction && (
            <Button
              onClick={onAction}
              className="mt-[18px] h-[44px] rounded-card px-[20px] text-[14.5px] font-medium"
            >
              {node.action}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function TodoNode({ node }: { node: PlanNodeData }) {
  return (
    <div className="flex items-start gap-3.5 rounded-card border border-line bg-bg px-[18px] py-4">
      <div className="mt-px h-6 w-6 flex-none rounded-full border-[1.5px] border-line-admin" />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium text-muted">{node.label}</div>
        <div className="mt-[3px] text-[13.5px] text-faint">{node.sub}</div>

        {node.inputs.length > 0 && (
          <ul className="mt-2.5 flex flex-col gap-1 pl-[18px]">
            {node.inputs.map((input) => (
              <li key={input} className="list-disc text-[13px] leading-normal text-muted">
                {input}
              </li>
            ))}
          </ul>
        )}

        {node.note && (
          <div className="mt-[11px] inline-flex items-center gap-2 rounded-full border border-line bg-bg px-[11px] py-1.5 text-xs text-muted">
            <span className="h-1.5 w-1.5 flex-none rounded-full bg-warn" />
            {node.note}
          </div>
        )}
      </div>
    </div>
  );
}

export function PlanNode({ node, isLast, onAction }: Props) {
  return (
    <div>
      {node.status === "done" && <DoneNode node={node} />}
      {node.status === "current" && <CurrentNode node={node} onAction={onAction} />}
      {node.status === "todo" && <TodoNode node={node} />}
      {!isLast && <Connector />}
    </div>
  );
}
