import type { ReactNode } from "react";

interface WorkspacePanelProps {
  heading: string;
  meta?: ReactNode;
  children: ReactNode;
}

export function WorkspacePanel({ heading, meta, children }: WorkspacePanelProps) {
  return (
    <section className="flex h-[calc(100vh-300px)] min-h-[440px] flex-col overflow-hidden rounded-card border border-line-admin bg-surface">
      <header className="flex flex-none items-center justify-between gap-3 border-b border-line-admin px-5 py-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[.07em] text-muted">{heading}</h2>
        {meta && <span className="text-[11.5px] text-muted">{meta}</span>}
      </header>
      {children}
    </section>
  );
}
