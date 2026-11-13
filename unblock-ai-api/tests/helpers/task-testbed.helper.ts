import { ObjectId } from "mongodb";
import { AssigneeResolutionService } from "../../src/services/assignee-resolution.service.js";
import { createAssigneeResolverRegistry } from "../../src/services/assignee-resolution/index.assignee-resolver.js";
import { RequesterProfileService } from "../../src/services/requester-profile.service.js";
import { TaskEffectExecutorService } from "../../src/services/task-effect-executor.service.js";
import { TaskEngineService } from "../../src/services/task-engine.service.js";
import { TaskFormService } from "../../src/services/task-form.service.js";
import { TaskPlanService } from "../../src/services/task-plan.service.js";
import { TaskService } from "../../src/services/task.service.js";
import { TaskTransitionService } from "../../src/services/task-transition.service.js";
import { ApprovalService } from "../../src/services/approval.service.js";
import { workflowTemplateNotFound } from "../../src/errors/workflow-template.error.js";
import { SelectionDecisionKind } from "../../src/data/constants/selection.constant.js";
import { FakeTaskModel } from "./fake-model.helper.js";
import { createSeedWorld, type SeedWorld } from "./seed-world.helper.js";
import { createSelectionTestbed, IT_LEAVE_ID, SELECTION_TEMPLATES, selectorDecision, type SelectionTestbed } from "./selection-testbed.helper.js";
import type { ITaskNotifier, ITaskTranscriptRenderer } from "../../src/lib/types/task/task-notification.type.js";
import type { TaskDocument, TaskStepRecord } from "../../src/lib/types/task/task-document.type.js";
import type { MailConfig } from "../../src/lib/types/config/config.type.js";
import type { RequesterProfile } from "../../src/lib/types/requester/requester.type.js";
import type { WorkflowDefinition } from "../../src/lib/types/workflow/workflow.type.js";

export const TEST_MAIL_CONFIG: MailConfig = {
  transport: "console",
  from: "Unblock <no-reply@unblock.test>",
  brevoApiKey: "",
  appPublicUrl: "https://unblock.test",
  tokenSecret: "test-token-secret",
  tokenTtlDays: 14,
};

export interface TaskTestbedOptions {
  userNames?: ReadonlyMap<string, string>;
  notifier?: ITaskNotifier | null;
  transcriptRenderer?: ITaskTranscriptRenderer | null;
  now?: () => Date;
}

export interface TaskTestbed {
  world: SeedWorld;
  selection: SelectionTestbed;
  taskModel: FakeTaskModel;
  taskService: TaskService;
  taskFormService: TaskFormService;
  taskEngine: TaskEngineService;
  transitions: TaskTransitionService;
  effectExecutor: TaskEffectExecutorService;
  approvalService: ApprovalService;
  auditRecords: unknown[];
  definitionOf(id: string): WorkflowDefinition;
  matchedSession(userId: string, workflowTemplateId?: string): Promise<string>;
}

export async function createTaskTestbed(options: TaskTestbedOptions = {}): Promise<TaskTestbed> {
  const world = await createSeedWorld();
  const profiles = new RequesterProfileService(world.repositories);
  const requesterProfileService = {
    getProfile: async (userId: string): Promise<RequesterProfile> => {
      const mapped = options.userNames?.get(userId);
      if (mapped === undefined) return profiles.getProfile(userId);
      return { ...(await profiles.getProfile(world.userIdOf(mapped))), userId };
    },
  };
  const organisationCatalogueService = { getCatalogue: async () => world.catalogue };
  const selection = await createSelectionTestbed({ requesterProfileService, organisationCatalogueService });

  const definitionOf = (id: string): WorkflowDefinition => {
    const template = SELECTION_TEMPLATES.find((candidate) => candidate.id === id);
    if (!template) throw workflowTemplateNotFound(id);
    return template.definition();
  };
  const workflowTemplateService = {
    getDefinition: async (id: string) => definitionOf(id),
    getPublishedDefinition: async (id: string) => ({ version: 1, definition: definitionOf(id) }),
  };

  const taskModel = new FakeTaskModel();
  const taskEngine = new TaskEngineService();
  const effectExecutor = new TaskEffectExecutorService({
    taskModel,
    mailConfig: TEST_MAIL_CONFIG,
    notifier: options.notifier ?? null,
    transcriptRenderer: options.transcriptRenderer ?? null,
    now: options.now,
  });
  const transitions = new TaskTransitionService({
    taskModel,
    effectExecutor,
    workflowTemplateService,
    taskConfig: { maxInformationRequestsPerStep: 3 },
    now: options.now,
  });
  const auditRecords: unknown[] = [];
  const taskService = new TaskService({
    taskModel,
    selectionService: selection.service,
    workflowTemplateService,
    requesterProfileService,
    organisationCatalogueService,
    taskPlanService: new TaskPlanService({
      assigneeResolutionService: new AssigneeResolutionService({
        registry: createAssigneeResolverRegistry({ holderLookup: world.repositories.userAffiliationRepository }),
      }),
    }),
    taskEngine,
    transitions,
    effectExecutor,
    auditService: {
      record: async (input) => {
        auditRecords.push(input);
        return { _id: new ObjectId(), resource: input.resource, resource_id: input.resourceId, action: input.action, actor: input.actor, snapshot: input.snapshot, reason: null, request_id: null, created_at: new Date() };
      },
    },
  });
  const taskFormService = new TaskFormService({ taskModel, taskEngine, transitions });
  const approvalService = new ApprovalService({ taskModel, taskEngine, transitions, mailConfig: TEST_MAIL_CONFIG });

  return {
    world,
    selection,
    taskModel,
    taskService,
    taskFormService,
    taskEngine,
    transitions,
    effectExecutor,
    approvalService,
    auditRecords,
    definitionOf,
    async matchedSession(userId: string, workflowTemplateId: string = IT_LEAVE_ID): Promise<string> {
      selection.selector.enqueue(selectorDecision({ decision: SelectionDecisionKind.MATCHED, workflow_template_id: workflowTemplateId }));
      const view = await selection.service.start(userId, "I want overseas leave");
      return String(view.session._id);
    },
  };
}

export const ENTRY_FORM_ID = "entry_form__form";

export function leaveEntryValues(returnDate = "2027-01-09"): Record<string, unknown> {
  return {
    "inputs.student_index_number": "IT/2023/017",
    "inputs.destination_country": "Japan",
    "inputs.destination_city": "Tokyo",
    "inputs.departure_date": "2026-12-01",
    "inputs.return_date": returnDate,
    "inputs.travel_reason": "Research visit",
    "assignees.advisor_review": { name: "Dr Advisor", email: "advisor@u.c" },
  };
}

export interface RecordedNotification {
  kind: string;
  stepId: string | null;
  to: string | null;
}

export class RecordingNotifier implements ITaskNotifier {
  readonly calls: RecordedNotification[] = [];
  readonly tokens = new Map<string, string>();
  completedTranscript: unknown = undefined;

  async sendApprovalRequest(_task: TaskDocument, step: TaskStepRecord, token: string): Promise<boolean> {
    this.tokens.set(step.id, token);
    this.calls.push({ kind: "approval_request", stepId: step.id, to: step.assignee?.email ?? null });
    return true;
  }

  async sendRequesterActionRequired(task: TaskDocument, step: TaskStepRecord): Promise<boolean> {
    this.calls.push({ kind: "action_required", stepId: step.id, to: task.requester.email });
    return true;
  }

  async sendInformationRequested(task: TaskDocument, step: TaskStepRecord): Promise<boolean> {
    this.calls.push({ kind: "information_requested", stepId: step.id, to: task.requester.email });
    return true;
  }

  async sendTaskRejected(task: TaskDocument, step: TaskStepRecord): Promise<boolean> {
    this.calls.push({ kind: "rejected", stepId: step.id, to: task.requester.email });
    return true;
  }

  async sendTaskCompleted(task: TaskDocument, transcript: unknown): Promise<boolean> {
    this.completedTranscript = transcript;
    this.calls.push({ kind: "completed", stepId: null, to: task.requester.email });
    return true;
  }

  async sendStepNotification(_task: TaskDocument, step: TaskStepRecord): Promise<boolean> {
    this.calls.push({ kind: "step_notification", stepId: step.id, to: step.assignee?.email ?? null });
    return true;
  }

  tokenFor(stepId: string): string {
    const token = this.tokens.get(stepId);
    if (token === undefined) throw new Error(`No approval token was sent for '${stepId}'`);
    return token;
  }
}
