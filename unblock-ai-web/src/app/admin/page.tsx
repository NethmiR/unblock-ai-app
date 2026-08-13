import Link from "next/link";
import { workflowsApi } from "@/lib/api/workflows";
import { TemplateFilters } from "@/components/admin/TemplateFilters";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import type { InstitutionType } from "@/types/workflow";

export const dynamic = "force-dynamic";   // always fetch fresh; never cache templates

const INSTITUTION_TYPES = [
  "university", "school", "company", "hospital", "government", "other",
] as const;

/** The backend 400s on an unknown value, so drop anything we don't recognise. */
function parseInstitutionType(raw: string | string[] | undefined): InstitutionType | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return INSTITUTION_TYPES.includes(value as InstitutionType)
    ? (value as InstitutionType)
    : undefined;
}

export default async function AdminTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ institution_type?: string | string[] }>;
}) {
  const { institution_type } = await searchParams;
  const templates = await workflowsApi.list(parseInstitutionType(institution_type));
  const isEmpty = templates.length === 0;

  return (
    <div className="mx-auto max-w-[1100px] px-8 pb-[120px] pt-10">
      <div className="mb-7 flex items-start justify-between gap-8">
        <div>
          <h1 className="mb-2 text-[26px] font-bold tracking-tight">Workflow templates</h1>
          <p className="max-w-[56ch] text-[13.5px] text-muted">
            {isEmpty
              ? "No templates yet for this organisation."
              : `${templates.length} template${templates.length === 1 ? "" : "s"} published across the faculty. Open a template to review the plain-English definition and the compiled flowchart.`}
          </p>
        </div>

        <Link href="/admin/templates/new" className="flex-none">
          <Button size="md" className="h-[42px] px-5 text-sm">
            <span className="text-base font-normal leading-none">＋</span>
            Create new template
          </Button>
        </Link>
      </div>

      {isEmpty ? (
        <EmptyState
          illustration={<DashedPlaceholder />}
          title="Nothing here yet"
          body="Write your first approval workflow in plain English — for example how overseas leave is approved in your faculty — and Unblock AI will compile it into an executable flowchart you can verify."
          action={
            <Link href="/admin/templates/new">
              <Button className="h-[42px] px-5 text-sm">
                <span className="text-base font-normal leading-none">＋</span>
                Create new template
              </Button>
            </Link>
          }
          footer={
            <div className="mt-[34px] flex w-full max-w-[520px] justify-center gap-7 border-t border-line-admin pt-6 text-xs text-muted">
              <div>Plain English in</div>
              <div>→</div>
              <div>Verified flowchart out</div>
            </div>
          }
        />
      ) : (
        <TemplateFilters templates={templates} />
      )}
    </div>
  );
}

function DashedPlaceholder() {
  return (
    <div className="mb-[26px] flex h-[104px] w-[180px] items-center justify-center rounded-lg border border-dashed border-line-admin bg-[repeating-linear-gradient(135deg,rgba(71,85,105,.05)_0_6px,transparent_6px_12px)]">
      <span className="font-mono text-[10px] tracking-wide text-muted">no templates</span>
    </div>
  );
}
