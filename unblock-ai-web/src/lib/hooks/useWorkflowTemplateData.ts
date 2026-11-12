"use client";
import useSWR, { type SWRResponse } from "swr";
import { fetcher } from "@/lib/api/client";
import {
  workflowTemplateListPath,
  workflowTemplatePath,
  workflowTemplateVersionPath,
  workflowTemplateVersionsPath,
} from "@/lib/api/workflow-templates";
import type {
  WorkflowTemplateListResponse,
  WorkflowTemplateResponse,
  WorkflowTemplateVersionListResponse,
  WorkflowTemplateVersionResponse,
} from "@/types/workflow-template";

export function useWorkflowTemplates(includeArchived: boolean): SWRResponse<WorkflowTemplateListResponse, unknown> {
  return useSWR<WorkflowTemplateListResponse>(workflowTemplateListPath(includeArchived), fetcher);
}

export function useWorkflowTemplate(workflowTemplateId: string): SWRResponse<WorkflowTemplateResponse, unknown> {
  return useSWR<WorkflowTemplateResponse>(workflowTemplatePath(workflowTemplateId), fetcher);
}

export function useWorkflowTemplateVersions(
  workflowTemplateId: string | null,
): SWRResponse<WorkflowTemplateVersionListResponse, unknown> {
  return useSWR<WorkflowTemplateVersionListResponse>(
    workflowTemplateId === null ? null : workflowTemplateVersionsPath(workflowTemplateId),
    fetcher,
  );
}

export function useWorkflowTemplateVersion(
  workflowTemplateId: string,
  version: number,
): SWRResponse<WorkflowTemplateVersionResponse, unknown> {
  return useSWR<WorkflowTemplateVersionResponse>(workflowTemplateVersionPath(workflowTemplateId, version), fetcher);
}
