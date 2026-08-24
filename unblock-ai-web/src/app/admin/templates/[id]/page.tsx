import { notFound } from "next/navigation";
import { workflowsApi } from "@/lib/api/workflows";
import { TemplateEditor } from "@/components/admin/TemplateEditor";
import { ApiError } from "@/lib/api/client";

export const dynamic = "force-dynamic";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let record;
  try {
    record = await workflowsApi.getRecord(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <TemplateEditor
      documentTitle={record.document.title}
      initialText={record.draft_text ?? ""}
      initialWorkflow={record.document}
      initialDraftId={record.draft_id}
      initialReviewStatus={record.review_status}
      initialVersion={record.version}
    />
  );
}
