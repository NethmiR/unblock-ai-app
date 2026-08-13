/**
 * The mockup's formatting toolbar, rendered but inert.
 *
 * Extraction consumes plain text, so bold/italic/etc. are stripped before the
 * LLM ever sees them - implementing them would produce formatting that
 * silently vanishes. Buttons are non-interactive (aria-hidden, tabIndex={-1})
 * with a title explaining why, so the toolbar never lies about what it does.
 */
const INERT_TITLE = "Rich text formatting is not yet supported";

function ToolbarButton({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      tabIndex={-1}
      title={INERT_TITLE}
      className="flex h-[30px] w-[30px] cursor-not-allowed items-center justify-center rounded-[8px] border border-line-admin bg-surface text-[13px] text-ink"
    >
      {children}
    </div>
  );
}

function Divider() {
  return <div aria-hidden className="mx-[3px] h-5 w-px bg-line-admin" />;
}

export function EditorToolbar() {
  return (
    <div
      aria-hidden
      className="flex flex-wrap items-center gap-1.5 border-b border-line-admin bg-bg px-3 py-2"
    >
      <div
        tabIndex={-1}
        title={INERT_TITLE}
        className="flex h-[30px] cursor-not-allowed items-center gap-[5px] rounded-[8px] border border-line-admin bg-surface px-2.5 text-[12.5px] text-ink"
      >
        Paragraph <span className="text-[8px] text-muted">▾</span>
      </div>
      <Divider />
      <ToolbarButton><span className="font-bold">B</span></ToolbarButton>
      <ToolbarButton><span className="italic">I</span></ToolbarButton>
      <ToolbarButton><span className="underline">U</span></ToolbarButton>
      <ToolbarButton><span className="line-through">S</span></ToolbarButton>
      <Divider />
      <div
        tabIndex={-1}
        title={INERT_TITLE}
        className="flex h-[30px] cursor-not-allowed items-center gap-1 rounded-[8px] border border-line-admin bg-surface px-2.5 text-[12px] text-ink"
      >
        <span className="text-sm font-semibold">A</span>
        <span className="text-[10px]">A</span>
        <span className="text-[8px] text-muted">▾</span>
      </div>
      <Divider />
      <ToolbarButton>
        <div className="flex flex-col items-start gap-[3px]">
          <div className="h-[1.5px] w-4 bg-muted" />
          <div className="h-[1.5px] w-2.5 bg-muted" />
          <div className="h-[1.5px] w-4 bg-muted" />
        </div>
      </ToolbarButton>
      <ToolbarButton>
        <div className="flex flex-col items-center gap-[3px]">
          <div className="h-[1.5px] w-4 bg-muted" />
          <div className="h-[1.5px] w-2.5 bg-muted" />
          <div className="h-[1.5px] w-4 bg-muted" />
        </div>
      </ToolbarButton>
      <ToolbarButton>
        <div className="flex flex-col items-end gap-[3px]">
          <div className="h-[1.5px] w-4 bg-muted" />
          <div className="h-[1.5px] w-2.5 bg-muted" />
          <div className="h-[1.5px] w-4 bg-muted" />
        </div>
      </ToolbarButton>
      <Divider />
      <ToolbarButton>
        <div className="flex items-center gap-1">
          <div className="flex flex-col gap-[3px]">
            <div className="h-[3px] w-[3px] rounded-[2px] bg-muted" />
            <div className="h-[3px] w-[3px] rounded-[2px] bg-muted" />
            <div className="h-[3px] w-[3px] rounded-[2px] bg-muted" />
          </div>
          <div className="flex flex-col gap-[3px]">
            <div className="h-[1.5px] w-[11px] bg-muted" />
            <div className="h-[1.5px] w-[11px] bg-muted" />
            <div className="h-[1.5px] w-[11px] bg-muted" />
          </div>
        </div>
      </ToolbarButton>
      <div
        tabIndex={-1}
        title={INERT_TITLE}
        className="flex h-[30px] cursor-not-allowed items-center gap-[5px] rounded-[8px] border border-line-admin bg-surface px-2.5 text-[12px] text-muted"
      >
        T<span className="text-[11px]">✕</span> Clear formatting
      </div>
    </div>
  );
}
