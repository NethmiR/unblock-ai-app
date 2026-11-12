import { FakeWorkflowTemplateModel, FakeWorkflowTemplateVersionModel } from "./fake-model.helper.js";
import { loadExpectedFixture } from "./fixture.helper.js";
import { WorkflowTemplateService } from "../../src/services/workflow-template.service.js";
import type { EmbeddingService } from "../../src/services/embedding.service.js";
import type { WorkflowTemplateGenerationService } from "../../src/services/workflow-template-generation.service.js";
import type { IUserRepository } from "../../src/repositories/user-repository/user-repository.interface.js";
import type { WorkflowDefinition } from "../../src/lib/types/workflow/workflow.type.js";
import type { GeneratedWorkflowTemplate } from "../../src/lib/types/workflow-template/workflow-template.type.js";

export const LEAVE_FIXTURE = "it_faculty_overseas_leave.json";
export const LEAVE_WORKFLOW_TEMPLATE_ID = "6a3d2c1b-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

export function generatedFromFixture(
  name: string = LEAVE_FIXTURE,
  overrides: { title?: string; attempts?: number } = {},
): GeneratedWorkflowTemplate {
  const { title, ...definition } = loadExpectedFixture(name);
  return { title: overrides.title ?? title, definition, attempts: overrides.attempts ?? 1 };
}

export type GenerationOutcome = GeneratedWorkflowTemplate | Error;

export class FakeGenerationService {
  readonly prompts: string[] = [];
  private readonly outcomes: GenerationOutcome[] = [];
  private readonly fallback: () => GenerationOutcome;

  constructor(fallback: () => GenerationOutcome = () => generatedFromFixture()) {
    this.fallback = fallback;
  }

  enqueue(...outcomes: GenerationOutcome[]): this {
    this.outcomes.push(...outcomes);
    return this;
  }

  generate(prompt: string): Promise<GeneratedWorkflowTemplate> {
    this.prompts.push(prompt);
    const outcome = this.outcomes.shift() ?? this.fallback();
    return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
  }

  asService(): WorkflowTemplateGenerationService {
    return this as unknown as WorkflowTemplateGenerationService;
  }
}

export class RecordingEmbeddingService {
  readonly embeddedTexts: string[] = [];

  embedDocument(text: string): Promise<number[]> {
    this.embeddedTexts.push(text);
    return Promise.resolve(new Array(8).fill(0));
  }

  embedQuery(): Promise<number[]> {
    return Promise.resolve(new Array(8).fill(0));
  }

  metadata(): { model: string; dim: number; embedded_at: string } {
    return { model: "fake-embedding", dim: 8, embedded_at: new Date().toISOString() };
  }

  asService(): EmbeddingService {
    return this as unknown as EmbeddingService;
  }
}

export interface WorkflowTemplateTestbed {
  service: WorkflowTemplateService;
  templateModel: FakeWorkflowTemplateModel;
  versionModel: FakeWorkflowTemplateVersionModel;
  generationService: FakeGenerationService;
  embeddingService: RecordingEmbeddingService;
}

export function createWorkflowTemplateTestbed(userRepository: IUserRepository): WorkflowTemplateTestbed {
  const templateModel = new FakeWorkflowTemplateModel();
  const versionModel = new FakeWorkflowTemplateVersionModel();
  const generationService = new FakeGenerationService();
  const embeddingService = new RecordingEmbeddingService();
  const service = new WorkflowTemplateService({
    workflowTemplateModel: templateModel as unknown as ConstructorParameters<typeof WorkflowTemplateService>[0]["workflowTemplateModel"],
    workflowTemplateVersionModel: versionModel as unknown as ConstructorParameters<
      typeof WorkflowTemplateService
    >[0]["workflowTemplateVersionModel"],
    generationService: generationService.asService(),
    embeddingService: embeddingService.asService(),
    userRepository,
  });
  return { service, templateModel, versionModel, generationService, embeddingService };
}

export function stubWorkflowTemplateService(workflow: WorkflowDefinition, version = 1): WorkflowTemplateService {
  return {
    getDefinition: () => Promise.resolve(workflow),
    getPublishedDefinition: () => Promise.resolve({ version, definition: workflow }),
  } as unknown as WorkflowTemplateService;
}
