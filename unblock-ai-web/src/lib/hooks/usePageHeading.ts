"use client";
import { useEffect } from "react";
import { usePageHeadingContext, type PageHeading } from "@/components/providers/PageHeadingProvider";

export function usePageHeading(heading: PageHeading | null): void {
  const { setHeading } = usePageHeadingContext();
  const title = heading?.title ?? null;
  const description = heading?.description ?? null;

  useEffect(() => {
    if (title === null) return;
    setHeading({ title, description });
    return () => setHeading(null);
  }, [description, setHeading, title]);
}

export function usePageHeadingOverride(): PageHeading | null {
  return usePageHeadingContext().heading;
}
