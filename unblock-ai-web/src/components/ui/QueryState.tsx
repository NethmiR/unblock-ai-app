import { InlineAlert } from "@/components/ui/InlineAlert";
import { SkeletonRows } from "@/components/ui/Skeleton";
import type { ReactNode } from "react";

interface QueryStateProps<T> {
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
  loadingLabel: string;
  errorMessage: string;
  onRetry: () => void;
  children: (data: T) => ReactNode;
}

export function QueryState<T>({ data, error, isLoading, loadingLabel, errorMessage, onRetry, children }: QueryStateProps<T>) {
  if (data !== undefined) return <>{children(data)}</>;
  if (isLoading) return <SkeletonRows label={loadingLabel} />;
  if (error !== undefined) return <InlineAlert onRetry={onRetry}>{errorMessage}</InlineAlert>;
  return null;
}
