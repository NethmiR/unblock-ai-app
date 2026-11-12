import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkflowTemplateDetailScreen } from "@/components/workflow-templates/detail/WorkflowTemplateDetailScreen";
import { workflowTemplatesApi } from "@/lib/api/workflow-templates";
import { requireRouteAccess } from "@/lib/auth/session";
import { dashboardPageMetadata } from "@/lib/navigation/page-metadata";
import { RoutePath, WORKFLOW_TEMPLATE_VERSION_QUERY_PARAMETER } from "@/lib/routing/route-path";
import { isUuid } from "@/lib/utils/identifier";
import { parseWorkflowTemplateVersionParam } from "@/lib/workflow-template/workflow-template-version-param";

type WorkflowTemplatePageProps = PageProps<"/dashboard/workflows/[workflowTemplateId]">;

export async function generateMetadata({ params }: WorkflowTemplatePageProps): Promise<Metadata> {
  const { workflowTemplateId } = await params;
  if (!isUuid(workflowTemplateId)) return dashboardPageMetadata(RoutePath.WORKFLOWS);
  try {
    const { workflow_template } = await workflowTemplatesApi.get(workflowTemplateId);
    return { title: workflow_template.title, description: workflow_template.description ?? undefined };
  } catch {
    return dashboardPageMetadata(RoutePath.WORKFLOWS);
  }
}

export default async function WorkflowTemplatePage({ params, searchParams }: WorkflowTemplatePageProps) {
  const { workflowTemplateId } = await params;
  if (!isUuid(workflowTemplateId)) notFound();
  await requireRouteAccess(RoutePath.WORKFLOWS);
  const version = parseWorkflowTemplateVersionParam((await searchParams)[WORKFLOW_TEMPLATE_VERSION_QUERY_PARAMETER]);
  return <WorkflowTemplateDetailScreen workflowTemplateId={workflowTemplateId} version={version} />;
}
