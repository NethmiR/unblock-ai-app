"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { useToast } from "@/components/providers/ToastProvider";
import { WORKFLOW_TEMPLATES_PATH, workflowTemplatePath, workflowTemplatesApi } from "@/lib/api/workflow-templates";
import { revalidateApiPaths } from "@/lib/api/swr-cache";
import { apiErrorField } from "@/lib/api/api-error";
import { workflowTemplateDetailPath } from "@/lib/routing/route-path";
import { WORKFLOW_TEMPLATE_COPY } from "@/lib/workflow-template/workflow-template-copy";
import { describeWorkflowTemplateError } from "@/lib/workflow-template/workflow-template-error-message";
import {
  editorBaselineOf,
  editorFlagsOf,
  type WorkflowTemplateEditorFlags,
} from "@/lib/workflow-template/workflow-template-editor-state";
import type { WorkflowTemplateDto, WorkflowTemplateResponse } from "@/types/workflow-template";

const COPY = WORKFLOW_TEMPLATE_COPY.editor;
const SLOW_GENERATION_MS = 8000;

export enum EditorAction {
  SAVE = "save",
  GENERATE = "generate",
  PUBLISH = "publish",
}

enum EditorField {
  TITLE = "title",
  PROMPT = "prompt",
}

interface FieldErrors {
  title: string | null;
  prompt: string | null;
}

const NO_FIELD_ERRORS: FieldErrors = { title: null, prompt: null };

export interface WorkflowTemplateEditor extends WorkflowTemplateEditorFlags {
  title: string;
  prompt: string;
  setTitle: (title: string) => void;
  setPrompt: (prompt: string) => void;
  fieldErrors: FieldErrors;
  actionError: string | null;
  pendingAction: EditorAction | null;
  isSlowGeneration: boolean;
  save: () => Promise<void>;
  generate: () => Promise<void>;
  publish: () => Promise<void>;
}

async function applyTemplate(response: WorkflowTemplateResponse): Promise<void> {
  await mutate(workflowTemplatePath(response.workflow_template.id), response, { revalidate: false });
  await revalidateApiPaths(`${WORKFLOW_TEMPLATES_PATH}?`, `${workflowTemplatePath(response.workflow_template.id)}/`);
}

export function useWorkflowTemplateEditor(template: WorkflowTemplateDto | null): WorkflowTemplateEditor {
  const router = useRouter();
  const toast = useToast();
  const baseline = editorBaselineOf(template);
  const [title, setTitle] = useState(baseline.title);
  const [prompt, setPrompt] = useState(baseline.prompt);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(NO_FIELD_ERRORS);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<EditorAction | null>(null);
  const [isSlowGeneration, setIsSlowGeneration] = useState(false);
  const flags = editorFlagsOf(template, { title, prompt }, pendingAction !== null);

  useEffect(() => {
    if (pendingAction !== EditorAction.GENERATE) return;
    const timer = window.setTimeout(() => setIsSlowGeneration(true), SLOW_GENERATION_MS);
    return () => {
      window.clearTimeout(timer);
      setIsSlowGeneration(false);
    };
  }, [pendingAction]);

  function validate(requireTitle: boolean): boolean {
    const errors: FieldErrors = {
      title: requireTitle && title.trim() === "" ? COPY.titleRequired : null,
      prompt: prompt.trim() === "" ? COPY.promptRequired : null,
    };
    setFieldErrors(errors);
    return errors.title === null && errors.prompt === null;
  }

  async function run(action: EditorAction, fallback: string, task: () => Promise<void>): Promise<void> {
    setPendingAction(action);
    setActionError(null);
    try {
      await task();
    } catch (err) {
      const field = apiErrorField(err);
      const message = describeWorkflowTemplateError(err, fallback);
      if (field === EditorField.TITLE || field === EditorField.PROMPT) setFieldErrors({ ...NO_FIELD_ERRORS, [field]: message });
      else setActionError(message);
    } finally {
      setPendingAction(null);
    }
  }

  async function openCreated(response: WorkflowTemplateResponse): Promise<void> {
    await applyTemplate(response);
    router.replace(workflowTemplateDetailPath(response.workflow_template.id));
  }

  function save(): Promise<void> {
    if (!validate(true)) return Promise.resolve();
    return run(EditorAction.SAVE, COPY.saveFailed, async () => {
      if (template === null) {
        const response = await workflowTemplatesApi.createDraft({ title: title.trim(), prompt: prompt.trim() });
        toast.success(COPY.draftSaved(response.workflow_template.title));
        await openCreated(response);
        return;
      }
      await applyTemplate(
        await workflowTemplatesApi.update(template.id, {
          ...(flags.isTitleDirty ? { title: title.trim() } : {}),
          ...(flags.isPromptDirty ? { draft_prompt: prompt.trim() } : {}),
        }),
      );
      toast.success(COPY.changesSaved);
    });
  }

  function generate(): Promise<void> {
    if (!validate(template !== null)) return Promise.resolve();
    return run(EditorAction.GENERATE, COPY.generateFailed, async () => {
      if (template === null) {
        const response = await workflowTemplatesApi.generate({ prompt: prompt.trim(), ...(title.trim() ? { title: title.trim() } : {}) });
        toast.success(COPY.generated(response.workflow_template.current_version ?? 1));
        await openCreated(response);
        return;
      }
      const response = await workflowTemplatesApi.regenerate(template.id, {
        prompt: prompt.trim(),
        ...(flags.isTitleDirty ? { title: title.trim() } : {}),
      });
      toast.success(COPY.generated(response.workflow_template.current_version ?? 1));
      await applyTemplate(response);
    });
  }

  function publish(): Promise<void> {
    if (template === null) return Promise.resolve();
    return run(EditorAction.PUBLISH, COPY.publishFailed, async () => {
      const response = await workflowTemplatesApi.publish(template.id);
      toast.success(COPY.published(response.workflow_template.title));
      await applyTemplate(response);
    });
  }

  return {
    ...flags,
    title,
    prompt,
    setTitle: (next) => {
      setTitle(next);
      setFieldErrors((errors) => ({ ...errors, title: null }));
    },
    setPrompt: (next) => {
      setPrompt(next);
      setFieldErrors((errors) => ({ ...errors, prompt: null }));
    },
    fieldErrors,
    actionError,
    pendingAction,
    isSlowGeneration,
    save,
    generate,
    publish,
  };
}
