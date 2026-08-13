import type { ReactNode } from "react";

interface EmptyStateProps {
  illustration?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  footer?: ReactNode;
}

export function EmptyState({ illustration, title, body, action, footer }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-card border border-line-admin bg-surface px-10 py-[72px] text-center">
      {illustration}
      <h2 className="mb-2.5 text-[19px] font-bold tracking-tight text-ink">{title}</h2>
      <p className="mb-[26px] max-w-[46ch] text-[13.5px] leading-relaxed text-muted">{body}</p>
      {action}
      {footer}
    </div>
  );
}
