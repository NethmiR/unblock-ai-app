import type { ReactNode } from "react";

export function ApproverSectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[.07em] text-muted">{children}</h2>;
}

export function ApproverDefinitionList({ items }: { items: ReadonlyArray<{ label: string; value: string }> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="min-w-0">
          <dt className="text-[12px] font-semibold text-muted">{item.label}</dt>
          <dd className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
