import { describe, expect, it } from "vitest";
import { WorkflowTemplateStatus, type WorkflowTemplateDto, type WorkflowTemplateVersionDto } from "@/types/workflow-template";
import { GenerationState, editorBaselineOf, editorFlagsOf, generationStateOf } from "./workflow-template-editor-state";

const CURRENT_PROMPT = "Students request leave from their advisor, then the head of department.";

function versionFixture(prompt: string = CURRENT_PROMPT): WorkflowTemplateVersionDto {
  return {
    version: 1,
    generation_attempts: 1,
    created_by: null,
    created_at: "2026-11-11T00:00:00.000Z",
    prompt,
    definition: {} as WorkflowTemplateVersionDto["definition"],
  };
}

function templateFixture(overrides: Partial<WorkflowTemplateDto> = {}): WorkflowTemplateDto {
  return {
    id: "6f1c1f9e-8a2b-4d4e-9a55-0f3a2b1c4d5e",
    title: "Student leave",
    description: null,
    status: WorkflowTemplateStatus.UNPUBLISHED,
    current_version: 1,
    has_ungenerated_changes: false,
    is_archived: false,
    archived_at: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-11-11T00:00:00.000Z",
    updated_at: "2026-11-11T00:00:00.000Z",
    draft_prompt: null,
    current: versionFixture(),
    ...overrides,
  };
}

describe("editorBaselineOf", () => {
  it("is empty for a new workflow template", () => {
    expect(editorBaselineOf(null)).toEqual({ title: "", prompt: "", generatedPrompt: null });
  });

  it("prefers the saved draft prompt over the generated one", () => {
    const baseline = editorBaselineOf(templateFixture({ draft_prompt: "Edited prompt" }));
    expect(baseline).toEqual({ title: "Student leave", prompt: "Edited prompt", generatedPrompt: CURRENT_PROMPT });
  });
});

describe("generationStateOf", () => {
  it("reports each generation state", () => {
    expect(generationStateOf("anything", null)).toBe(GenerationState.NONE);
    expect(generationStateOf(`  ${CURRENT_PROMPT}  `, CURRENT_PROMPT)).toBe(GenerationState.CURRENT);
    expect(generationStateOf("Different prompt", CURRENT_PROMPT)).toBe(GenerationState.STALE);
  });
});

describe("editorFlagsOf", () => {
  it("lets a new prompt be saved and generated but not published", () => {
    const flags = editorFlagsOf(null, { title: "Leave", prompt: "Some prompt" }, false);
    expect(flags).toMatchObject({ isDirty: true, canSave: true, canGenerate: true, canPublish: false });
  });

  it("allows publishing only an unchanged, freshly generated unpublished template", () => {
    const template = templateFixture();
    expect(editorFlagsOf(template, { title: template.title, prompt: CURRENT_PROMPT }, false)).toMatchObject({
      isDirty: false,
      canSave: false,
      canGenerate: false,
      canPublish: true,
    });
    expect(editorFlagsOf(template, { title: "Renamed", prompt: CURRENT_PROMPT }, false).canPublish).toBe(false);
  });

  it("enables regeneration once the prompt changes", () => {
    const template = templateFixture({ status: WorkflowTemplateStatus.PUBLISHED });
    const flags = editorFlagsOf(template, { title: template.title, prompt: "A new process" }, false);
    expect(flags).toMatchObject({ generationState: GenerationState.STALE, canGenerate: true, canPublish: false });
  });

  it("locks every action while busy or archived", () => {
    const archived = templateFixture({ is_archived: true });
    for (const [template, busy] of [
      [archived, false],
      [templateFixture(), true],
    ] as const) {
      expect(editorFlagsOf(template, { title: "Changed", prompt: "Changed" }, busy)).toMatchObject({
        canSave: false,
        canGenerate: false,
        canPublish: false,
      });
    }
  });
});
