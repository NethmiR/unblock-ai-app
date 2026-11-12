"use client";
import { useState } from "react";
import { FormField } from "@/components/ui/form/FormField";
import { TextInput } from "@/components/ui/form/TextInput";
import { LeavePageDialog } from "@/components/ui/LeavePageDialog";
import { LifecycleDialog } from "@/components/organisation/shared/LifecycleDialog";
import { WorkflowTemplateStatusBadges } from "@/components/workflow-templates/shared/WorkflowTemplateStatusBadges";
import { WorkflowTemplateVersionsDrawer } from "@/components/workflow-templates/versions/WorkflowTemplateVersionsDrawer";
import { WorkflowTemplateFlowchartPanel } from "@/components/workflow-templates/workspace/WorkflowTemplateFlowchartPanel";
import { WorkflowTemplateGenerationNotes } from "@/components/workflow-templates/workspace/WorkflowTemplateGenerationNotes";
import { WorkflowTemplatePromptPanel } from "@/components/workflow-templates/workspace/WorkflowTemplatePromptPanel";
import { WorkflowTemplateWorkspace } from "@/components/workflow-templates/workspace/WorkflowTemplateWorkspace";
import { WorkflowTemplateBackLink } from "./WorkflowTemplateBackLink";
import { WorkflowTemplateEditorActions } from "./WorkflowTemplateEditorActions";
import { WorkflowTemplateEditorNotices } from "./WorkflowTemplateEditorNotices";
import { WorkflowTemplateVersionMeta } from "./WorkflowTemplateVersionMeta";
import { useUnsavedChangesGuard } from "@/lib/hooks/useUnsavedChangesGuard";
import { EditorAction, useWorkflowTemplateEditor } from "@/lib/hooks/useWorkflowTemplateEditor";
import {
  toWorkflowTemplateLifecycleTarget,
  useWorkflowTemplateLifecycle,
  workflowTemplateLifecycleAction,
} from "@/lib/hooks/useWorkflowTemplateLifecycle";
import { LifecycleAction } from "@/lib/organisation/lifecycle-action";
import { WORKFLOW_TEMPLATE_COPY } from "@/lib/workflow-template/workflow-template-copy";
import { GenerationState } from "@/lib/workflow-template/workflow-template-editor-state";
import { WORKFLOW_TEMPLATE_FIELD_LIMIT } from "@/lib/workflow-template/workflow-template-field-limit";
import { IconName } from "@/types/icon";
import type { MenuItem } from "@/types/menu";
import type { WorkflowTemplateDto } from "@/types/workflow-template";

const COPY = WORKFLOW_TEMPLATE_COPY.editor;
const ACTIONS = WORKFLOW_TEMPLATE_COPY.actions;

export function WorkflowTemplateEditor({ template }: { template: WorkflowTemplateDto | null }) {
  const editor = useWorkflowTemplateEditor(template);
  const guard = useUnsavedChangesGuard(editor.isDirty || editor.pendingAction !== null);
  const lifecycle = useWorkflowTemplateLifecycle();
  const [isVersionsOpen, setIsVersionsOpen] = useState(false);
  const isArchived = template?.is_archived ?? false;

  const menuItems: MenuItem[] = [];
  if (template?.current) {
    menuItems.push({ label: ACTIONS.versionHistory, icon: IconName.HISTORY, onSelect: () => setIsVersionsOpen(true) });
  }
  if (template) {
    const action = workflowTemplateLifecycleAction(template);
    menuItems.push({
      label: action === LifecycleAction.ARCHIVE ? ACTIONS.archive : ACTIONS.restore,
      icon: action === LifecycleAction.ARCHIVE ? IconName.ARCHIVE : IconName.RESTORE,
      disabledReason: editor.isDirty || editor.pendingAction !== null ? WORKFLOW_TEMPLATE_COPY.editor.saveFirst : undefined,
      onSelect: () => lifecycle.open(action, toWorkflowTemplateLifecycleTarget(template)),
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 flex-1">
          <WorkflowTemplateBackLink />
          <FormField label={COPY.titleLabel} required error={editor.fieldErrors.title} className="mt-3 max-w-2xl">
            {(control) => (
              <TextInput
                {...control}
                value={editor.title}
                onChange={(event) => editor.setTitle(event.target.value)}
                placeholder={COPY.titlePlaceholder}
                readOnly={isArchived}
                maxLength={WORKFLOW_TEMPLATE_FIELD_LIMIT.TITLE_MAX_LENGTH}
                className="text-[15px] font-semibold"
              />
            )}
          </FormField>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
            {template && <WorkflowTemplateStatusBadges template={template} />}
            <WorkflowTemplateVersionMeta version={template?.current ?? null} />
          </div>
        </div>
        <WorkflowTemplateEditorActions template={template} editor={editor} menuItems={menuItems} />
      </header>

      <WorkflowTemplateEditorNotices template={template} actionError={editor.actionError} />

      <WorkflowTemplateWorkspace>
        <WorkflowTemplatePromptPanel
          value={editor.prompt}
          onChange={editor.setPrompt}
          readOnly={isArchived || editor.pendingAction === EditorAction.GENERATE}
          error={editor.fieldErrors.prompt}
        />
        <WorkflowTemplateFlowchartPanel
          definition={template?.current?.definition ?? null}
          isGenerating={editor.pendingAction === EditorAction.GENERATE}
          isSlowGeneration={editor.isSlowGeneration}
          isStale={editor.generationState === GenerationState.STALE}
          hasPrompt={editor.prompt.trim() !== ""}
        />
      </WorkflowTemplateWorkspace>

      {template?.current && <WorkflowTemplateGenerationNotes metadata={template.current.definition.metadata} />}

      {isVersionsOpen && template && (
        <WorkflowTemplateVersionsDrawer template={template} viewingVersion={null} onClose={() => setIsVersionsOpen(false)} />
      )}
      <LifecycleDialog state={lifecycle} />
      <LeavePageDialog guard={guard} />
    </div>
  );
}
