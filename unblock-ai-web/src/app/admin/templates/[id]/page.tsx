import { notFound } from "next/navigation";
import { workflowsApi } from "@/lib/api/workflows";
import { draftsApi } from "@/lib/api/drafts";
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

  // The originating draft carries the admin's ORIGINAL prose, which is what the
  // left panel must show - not a reconstruction from the workflow JSON.
  const draftId = record.draft_id;
  let originalText = "";
  if (draftId) {
    try {
      originalText = (await draftsApi.get(draftId)).raw_text;
    } catch (err) {
      // A malformed draft id fails inside the Mongo driver and surfaces as
      // 500 DATABASE_ERROR rather than 404 - treat it as not-found too.
      if (err instanceof ApiError && (err.status === 404 || err.code === "DATABASE_ERROR")) notFound();
      throw err;
    }
  }

  return (
    <TemplateEditor
      documentTitle={record.document.title}
      initialText={originalText}
      initialWorkflow={record.document}
      initialDraftId={draftId}
      initialReviewStatus={record.review_status}
      initialVersion={record.version}
    />
  );
}
