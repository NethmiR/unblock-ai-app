"use client";
import { Button } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { EditorAction, type WorkflowTemplateEditor } from "@/lib/hooks/useWorkflowTemplateEditor";
import { WORKFLOW_TEMPLATE_COPY } from "@/lib/workflow-template/workflow-template-copy";
import { WorkflowTemplateStatus, type WorkflowTemplateDto } from "@/types/workflow-template";
import type { MenuItem } from "@/types/menu";

const COPY = WORKFLOW_TEMPLATE_COPY.editor;

interface WorkflowTemplateEditorActionsProps {
  template: WorkflowTemplateDto | null;
  editor: WorkflowTemplateEditor;
  menuItems: readonly MenuItem[];
}

export function WorkflowTemplateEditorActions({ template, editor, menuItems }: WorkflowTemplateEditorActionsProps) {
  const isSaving = editor.pendingAction === EditorAction.SAVE;
  const isGenerating = editor.pendingAction === EditorAction.GENERATE;
  const isPublishing = editor.pendingAction === EditorAction.PUBLISH;
  const showPublish = template?.status === WorkflowTemplateStatus.UNPUBLISHED && !template.is_archived;

  return (
    <div className="flex flex-none flex-wrap items-center gap-2.5">
      <Button variant="secondary" onClick={() => void editor.save()} disabled={!editor.canSave}>
        {isSaving ? COPY.saving : editor.isDirty || template === null ? COPY.save : COPY.saved}
      </Button>
      <Button variant={showPublish ? "secondary" : "primary"} onClick={() => void editor.generate()} disabled={!editor.canGenerate}>
        {isGenerating ? COPY.generating : template?.current ? COPY.regenerate : COPY.generate}
      </Button>
      {showPublish && (
        <Button onClick={() => void editor.publish()} disabled={!editor.canPublish}>
          {isPublishing ? COPY.publishing : COPY.publish}
        </Button>
      )}
      {menuItems.length > 0 && <Menu items={menuItems} />}
    </div>
  );
}
