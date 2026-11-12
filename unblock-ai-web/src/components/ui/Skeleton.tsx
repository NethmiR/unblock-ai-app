import { cn } from "@/lib/utils/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-control bg-slate-200/70", className)} />;
}

export function SkeletonRows({ count = 5, label }: { count?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="overflow-hidden rounded-card border border-line-admin">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-line-admin px-4 py-4 last:border-b-0">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="hidden h-6 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}
