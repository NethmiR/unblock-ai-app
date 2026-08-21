import { Card } from "@/components/ui/Card";

export default function ApprovalLoading() {
  return (
    <div className="mx-auto max-w-[720px] animate-pulse px-6 py-14">
      <div className="mb-2 h-3 w-32 rounded bg-line-admin" />
      <div className="mb-8 h-7 w-2/3 rounded bg-line-admin" />

      <Card className="mb-6 px-7 py-6">
        <div className="mb-2 h-4 w-1/3 rounded bg-line-admin" />
        <div className="h-3 w-full rounded bg-line-admin" />
      </Card>

      <Card className="px-7 py-6">
        <div className="mb-4 h-3 w-1/4 rounded bg-line-admin" />
        <div className="mb-3 h-3 w-full rounded bg-line-admin" />
        <div className="h-3 w-2/3 rounded bg-line-admin" />
      </Card>
    </div>
  );
}
