import { WorkflowTemplateStatus, type WorkflowTemplateDto } from "@/types/workflow-template";

export enum GenerationState {
  NONE = "none",
  CURRENT = "current",
  STALE = "stale",
}

export interface WorkflowTemplateEditorBaseline {
  title: string;
  prompt: string;
  generatedPrompt: string | null;
}

export interface WorkflowTemplateEditorFlags {
  isTitleDirty: boolean;
  isPromptDirty: boolean;
  isDirty: boolean;
  generationState: GenerationState;
  canSave: boolean;
  canGenerate: boolean;
  canPublish: boolean;
}

export function editorBaselineOf(template: WorkflowTemplateDto | null): WorkflowTemplateEditorBaseline {
  return {
    title: template?.title ?? "",
    prompt: template?.draft_prompt ?? template?.current?.prompt ?? "",
    generatedPrompt: template?.current?.prompt ?? null,
  };
}

export function generationStateOf(prompt: string, generatedPrompt: string | null): GenerationState {
  if (generatedPrompt === null) return GenerationState.NONE;
  return prompt.trim() === generatedPrompt ? GenerationState.CURRENT : GenerationState.STALE;
}

export function editorFlagsOf(
  template: WorkflowTemplateDto | null,
  draft: { title: string; prompt: string },
  isBusy: boolean,
): WorkflowTemplateEditorFlags {
  const baseline = editorBaselineOf(template);
  const isTitleDirty = draft.title.trim() !== baseline.title;
  const isPromptDirty = draft.prompt.trim() !== baseline.prompt.trim();
  const isDirty = isTitleDirty || isPromptDirty;
  const generationState = generationStateOf(draft.prompt, baseline.generatedPrompt);
  const isEditable = !isBusy && !(template?.is_archived ?? false);
  const hasPrompt = draft.prompt.trim() !== "";

  return {
    isTitleDirty,
    isPromptDirty,
    isDirty,
    generationState,
    canSave: isEditable && isDirty,
    canGenerate: isEditable && hasPrompt && generationState !== GenerationState.CURRENT,
    canPublish:
      isEditable &&
      !isDirty &&
      template?.status === WorkflowTemplateStatus.UNPUBLISHED &&
      generationState === GenerationState.CURRENT,
  };
}
