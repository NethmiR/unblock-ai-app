import Link from "next/link";
import { workflowsApi } from "@/lib/api/workflows";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DateTime } from "@/components/ui/DateTime";

export const dynamic = "force-dynamic"; // never cache an audit log

export default async function DeletionLogPage() {
  const deletions = await workflowsApi.listDeletions(50);
  const isEmpty = deletions.length === 0;

  return (
    <div className="mx-auto max-w-[1100px] px-8 pb-[120px] pt-10">
      <div className="mb-7">
        <Link href="/admin" className="mb-2 inline-block text-[12.5px] text-muted hover:text-ink">
          ← Back to templates
        </Link>
        <h1 className="mb-2 text-[26px] font-bold tracking-tight">Template deletion log</h1>
        <p className="max-w-[62ch] text-[13.5px] text-muted">
          {isEmpty
            ? "No template has been deleted yet."
            : `${deletions.length} deletion${deletions.length === 1 ? "" : "s"}, most recent first - who removed each template, and when.`}
        </p>
      </div>

      {isEmpty ? (
        <EmptyState title="Nothing here yet" body="Deleted templates and the admin who removed them will show up here." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-line-admin text-[11.5px] uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-semibold">Template</th>
                  <th className="px-5 py-3 font-semibold">Deleted by</th>
                  <th className="px-5 py-3 font-semibold">When</th>
                  <th className="px-5 py-3 font-semibold">Versions removed</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {deletions.map((deletion) => (
                  <tr key={deletion.id} className="border-b border-line-admin last:border-0">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-ink">{deletion.template_title}</div>
                      <div className="font-mono text-[11px] text-faint">{deletion.workflow_id}</div>
                    </td>
                    <td className="px-5 py-3.5 text-ink">{deletion.deleted_by_username}</td>
                    <td className="px-5 py-3.5 text-muted">
                      <DateTime iso={deletion.deleted_at} />
                    </td>
                    <td className="px-5 py-3.5 text-ink">{deletion.versions_removed}</td>
                    <td className="px-5 py-3.5">
                      {deletion.versions_removed === 0 ? (
                        <Badge tone="warn">Incomplete</Badge>
                      ) : (
                        <Badge tone="success">Completed</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
