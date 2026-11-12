"use client";
import { useCallback, useEffect, useState } from "react";

const HIGHLIGHT_DURATION_MS = 2500;

export function rowElementId(scope: string, id: string): string {
  return `${scope}-row-${id}`;
}

export function useHighlightedRow(scope: string): { highlightedId: string | null; highlight: (id: string) => void } {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    if (highlightedId === null) return;
    document.getElementById(rowElementId(scope, highlightedId))?.scrollIntoView({ block: "center", behavior: "smooth" });
    const timeout = window.setTimeout(() => setHighlightedId(null), HIGHLIGHT_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [highlightedId, scope]);

  const highlight = useCallback((id: string) => setHighlightedId(id), []);
  return { highlightedId, highlight };
}
