import { Card } from "@/components/ui/Card";
import { ApproverHeader } from "@/components/approvals/ApproverView";

export default function ApprovalLoading() {
  return (
    <>
      <ApproverHeader />
      <div className="mx-auto grid max-w-[1180px] animate-pulse gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:py-10">
        <div className="space-y-4">
          <div className="h-3 w-32 rounded bg-line-admin" />
          <div className="h-7 w-2/3 rounded bg-line-admin" />
          <Card className="px-5 py-4">
            <div className="mb-2 h-4 w-1/3 rounded bg-line-admin" />
            <div className="h-3 w-1/2 rounded bg-line-admin" />
          </Card>
          <Card className="px-5 py-4">
            <div className="mb-4 h-3 w-1/4 rounded bg-line-admin" />
            <div className="mb-3 h-3 w-full rounded bg-line-admin" />
            <div className="h-3 w-2/3 rounded bg-line-admin" />
          </Card>
        </div>
        <div className="hidden space-y-3 lg:block">
          <div className="h-3 w-1/2 rounded bg-line-admin" />
          <div className="h-10 rounded bg-line-admin" />
          <div className="h-10 rounded bg-line-admin" />
          <div className="h-10 rounded bg-line-admin" />
        </div>
      </div>
    </>
  );
}
