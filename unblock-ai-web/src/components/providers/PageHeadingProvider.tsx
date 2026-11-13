"use client";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface PageHeading {
  title: string;
  description: string | null;
}

interface PageHeadingContextValue {
  heading: PageHeading | null;
  setHeading: (heading: PageHeading | null) => void;
}

const PageHeadingContext = createContext<PageHeadingContextValue | null>(null);

export function PageHeadingProvider({ children }: { children: ReactNode }) {
  const [heading, setHeading] = useState<PageHeading | null>(null);
  const value = useMemo(() => ({ heading, setHeading }), [heading]);
  return <PageHeadingContext value={value}>{children}</PageHeadingContext>;
}

export function usePageHeadingContext(): PageHeadingContextValue {
  const context = useContext(PageHeadingContext);
  if (!context) throw new Error("usePageHeadingContext must be used within a PageHeadingProvider");
  return context;
}
