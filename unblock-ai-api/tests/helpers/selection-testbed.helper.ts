import { ObjectId } from "mongodb";
import { SelectionService, type SelectionServiceOptions } from "../../src/services/selection.service.js";
import { SelectionDecisionKind } from "../../src/data/constants/selection.constant.js";
import { FakeSelectionSessionModel, FakeWorkflowTemplateModel, FakeWorkflowTemplateVersionModel } from "./fake-model.helper.js";
import { loadExpectedFixture } from "./fixture.helper.js";
import { buildOrganisationCatalogue, sampleRequesterProfile, seedOrganisationCatalogueService } from "./organisation-catalogue.helper.js";
import { WorkflowTemplateStatus } from "../../src/data/constants/workflow-template.constant.js";
import type { SelectorRequest } from "../../src/services/selector.service.js";
import type { BoostedCandidate } from "../../src/lib/types/selection/candidate.type.js";
import type { SelectorDecision } from "../../src/lib/types/selection/decision.type.js";
import type { WorkflowDefinition } from "../../src/lib/types/workflow/workflow.type.js";

export const IT_LEAVE_ID = "6a3d2c1b-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
export const ENG_LEAVE_ID = "7b4e3d2c-5f6a-4b7c-9d8e-0f1a2b3c4d5e";
export const WORKSHOP_ID = "8c5f4e3d-6a7b-4c8d-8e9f-1a2b3c4d5e6f";

export function itLeaveDefinition(): WorkflowDefinition {
  return loadExpectedFixture("it_faculty_overseas_leave.json");
}

export function engLeaveDefinition(): WorkflowDefinition {
  const definition = itLeaveDefinition();
  return {
    ...definition,
    title: "Engineering Faculty Overseas Leave Approval",
    scope: { ...definition.scope, applies_to: { ...definition.scope.applies_to, organisational_unit_codes: ["FOE"] } },
  };
}

export function workshopDefinition(): WorkflowDefinition {
  return loadExpectedFixture("departmental_event_workshop.json");
}

export const SELECTION_TEMPLATES: ReadonlyArray<{ id: string; definition: () => WorkflowDefinition }> = [
  { id: IT_LEAVE_ID, definition: itLeaveDefinition },
  { id: ENG_LEAVE_ID, definition: engLeaveDefinition },
  { id: WORKSHOP_ID, definition: workshopDefinition },
];

export function selectorDecision(overrides: Partial<SelectorDecision> = {}): SelectorDecision {
  return {
    decision: SelectionDecisionKind.MATCHED,
    workflow_template_id: IT_LEAVE_ID,
    confidence: "high",
    question: null,
    options: [],
    matched_fact_ids: ["P1"],
    reasoning: "test",
    ...overrides,
  };
}

export class FakeSelector {
  readonly requests: SelectorRequest[] = [];
  private readonly queue: SelectorDecision[] = [];

  enqueue(...decisions: SelectorDecision[]): this {
    this.queue.push(...decisions);
    return this;
  }

  decide(request: SelectorRequest): Promise<SelectorDecision> {
    this.requests.push(request);
    return Promise.resolve(this.queue.shift() ?? selectorDecision());
  }
}

export class FakeRetrieval {
  readonly queries: string[] = [];
  results: string[] = [IT_LEAVE_ID, ENG_LEAVE_ID];

  retrieve(query: string): Promise<BoostedCandidate[]> {
    this.queries.push(query);
    return Promise.resolve(
      this.results.map((id, index) => {
        const definition = SELECTION_TEMPLATES.find((template) => template.id === id)!.definition();
        return {
          workflow_template_id: id,
          workflow_template_version: 1,
          title: definition.title,
          description: definition.description,
          score: 0.9 - index * 0.05,
          aliases_lower: [],
          retrieval_summary: definition.retrieval_summary,
          retrieval_text: "",
          base_score: 0.9 - index * 0.05,
          alias_hits: [],
        };
      }),
    );
  }
}

export interface SelectionTestbed {
  service: SelectionService;
  templateModel: FakeWorkflowTemplateModel;
  selector: FakeSelector;
  retrieval: FakeRetrieval;
  sessionModel: FakeSelectionSessionModel;
  userIdOf(fullName: string): string;
}

export interface SelectionTestbedOptions {
  maxRounds?: number;
  fullNameOf?: (userId: string) => string;
  requesterProfileService?: SelectionServiceOptions["requesterProfileService"];
  organisationCatalogueService?: SelectionServiceOptions["organisationCatalogueService"];
}

export async function createSelectionTestbed(options: SelectionTestbedOptions = {}): Promise<SelectionTestbed> {
  const catalogue = buildOrganisationCatalogue();
  const templateModel = new FakeWorkflowTemplateModel();
  const versionModel = new FakeWorkflowTemplateVersionModel();
  const now = new Date();
  for (const template of SELECTION_TEMPLATES) {
    const { title, ...definition } = template.definition();
    await templateModel.insert({
      _id: template.id,
      title,
      description: definition.description,
      status: WorkflowTemplateStatus.PUBLISHED,
      draft_prompt: null,
      current_version: 1,
      retrieval: null,
      created_by: "manager",
      updated_by: "manager",
      archived_at: null,
      created_at: now,
      updated_at: now,
    });
    versionModel.versions.push({
      _id: new ObjectId(),
      workflow_template_id: template.id,
      version: 1,
      prompt: "",
      definition,
      generation_attempts: 1,
      created_by: "manager",
      created_at: now,
    });
  }

  const selector = new FakeSelector();
  const retrieval = new FakeRetrieval();
  const sessionModel = new FakeSelectionSessionModel();
  const userIdOf = (fullName: string): string => `user:${fullName}`;
  const fullNameOf = options.fullNameOf ?? ((userId: string): string => userId.replace("user:", ""));
  const service = new SelectionService({
    retrievalService: retrieval,
    selectorService: selector,
    sessionModel,
    workflowTemplateService: {
      getDefinition: async (id) => SELECTION_TEMPLATES.find((template) => template.id === id)!.definition(),
    },
    workflowTemplateModel: templateModel,
    workflowTemplateVersionModel: versionModel,
    requesterProfileService: options.requesterProfileService ?? {
      getProfile: async (userId) => ({ ...sampleRequesterProfile(fullNameOf(userId), catalogue), userId }),
    },
    organisationCatalogueService: options.organisationCatalogueService ?? seedOrganisationCatalogueService(),
    selectionConfig: { sessionTtlHours: 24, maxRounds: options.maxRounds ?? 2 },
  });
  return { service, templateModel, selector, retrieval, sessionModel, userIdOf };
}
