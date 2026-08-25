import Link from "next/link";
import { Button } from "@/components/ui/Button";

/**
 * Shown both on a genuinely empty list and once the last row is deleted, which
 * is why it is its own component rather than inline in the page: `JobList`
 * needs it too, and the page is a server component it cannot import from.
 */
export function EmptyJobs() {
  return (
    <div className="flex flex-col items-center rounded-card border border-line bg-surface px-10 py-20 text-center">
      <div className="mb-6 h-14 w-14 rounded-card border border-dashed border-slate-300" />
      <div className="text-xl font-semibold tracking-tight">Nothing in progress yet</div>
      <p className="mb-7 mt-2.5 max-w-[44ch] text-[15px] text-muted">
        Start by describing what you need — overseas leave, a verification letter, a hall booking.
        We&apos;ll work out who has to approve it.
      </p>
      <Link href="/portal/jobs/new">
        <Button className="h-[50px] rounded-card px-[22px] text-[15px] font-medium">
          New Request
        </Button>
      </Link>
    </div>
  );
}
