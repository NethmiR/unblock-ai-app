"use client";
import { Button } from "@/components/ui/Button";
import { UI_COPY } from "@/lib/constants/ui-copy";

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  label: string;
  onOffsetChange: (offset: number) => void;
}

export function Pagination({ total, limit, offset, label, onOffsetChange }: PaginationProps) {
  if (total === 0) return null;
  const first = offset + 1;
  const last = Math.min(offset + limit, total);

  return (
    <nav aria-label={label} className="flex flex-col items-center justify-between gap-3 pt-4 sm:flex-row">
      <p className="text-[12.5px] text-muted" aria-live="polite">
        {UI_COPY.showingRange(first, last, total)}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => onOffsetChange(Math.max(0, offset - limit))}>
          {UI_COPY.previousPage}
        </Button>
        <Button variant="secondary" size="sm" disabled={last >= total} onClick={() => onOffsetChange(offset + limit)}>
          {UI_COPY.nextPage}
        </Button>
      </div>
    </nav>
  );
}
