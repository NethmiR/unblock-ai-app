import { ObjectId } from "mongodb";
import { AssigneeResolutionNote, AssigneeSource } from "../../src/data/constants/assignee.constant.js";
import { ApprovalChannel, TaskCreationSource, TaskStatus } from "../../src/data/constants/task.constant.js";
import { compileTaskPlan } from "../../src/utils/task/task-plan-compiler.util.js";
import { assigneeFieldId } from "../../src/utils/task/task-field-id.util.js";
import { sampleRequesterProfile } from "./organisation-catalogue.helper.js";
import type { ApprovalActor } from "../../src/lib/types/approval/approval.type.js";
import type { AssigneeResolution } from "../../src/lib/types/assignee/assignee-resolver.type.js";
import type { RequesterProfile } from "../../src/lib/types/requester/requester.type.js";
import type { TaskAssignee, TaskDocument } from "../../src/lib/types/task/task-document.type.js";
import type { TaskEngineContext } from "../../src/lib/types/task/task-engine.type.js";
import type { WorkflowDefinition } from "../../src/lib/types/workflow/workflow.type.js";

export const TASK_NOW = new Date("2026-11-13T09:00:00Z");

export const EMAIL_ACTOR: ApprovalActor = { channel: ApprovalChannel.EMAIL_LINK, user_id: null };

export function directoryResolution(stepId: string, fullName: string, email: string, designationTitle: string): AssigneeResolution {
  return {
    step_id: stepId,
    assignee: {
      source: AssigneeSource.DIRECTORY,
      user_id: `user-${email}`,
      full_name: fullName,
      email,
      designation_title: designationTitle,
      organisational_unit_name: null,
      field_id: null,
      note: null,
      candidates: [],
    },
    options: [],
  };
}

export function suppliedResolution(stepId: string): AssigneeResolution {
  const assignee: TaskAssignee = {
    source: AssigneeSource.REQUESTER_SUPPLIED,
    user_id: null,
    full_name: null,
    email: null,
    designation_title: null,
    organisational_unit_name: null,
    field_id: assigneeFieldId(stepId),
    note: AssigneeResolutionNote.NOT_A_DESIGNATION,
    candidates: [],
  };
  return { step_id: stepId, assignee, options: [] };
}

export function choiceResolution(stepId: string): AssigneeResolution {
  return {
    step_id: stepId,
    assignee: {
      source: AssigneeSource.REQUESTER_CHOICE,
      user_id: null,
      full_name: null,
      email: null,
      designation_title: "Head of Department",
      organisational_unit_name: null,
      field_id: assigneeFieldId(stepId),
      note: AssigneeResolutionNote.MULTIPLE_HOLDERS,
      candidates: [
        { user_id: "user-cse", name: "Chamari Gunawardena", email: "u4@u.c" },
        { user_id: "user-it", name: "Dinesh Wijesinghe", email: "u19@u.c" },
      ],
    },
    options: [
      { value: "user-cse", label: "Chamari Gunawardena", description: "Head of Department" },
      { value: "user-it", label: "Dinesh Wijesinghe", description: "Head of Department" },
    ],
  };
}

export function leaveResolutions(): AssigneeResolution[] {
  return [
    suppliedResolution("advisor_review"),
    directoryResolution("hod_review", "Dinesh Wijesinghe", "u19@u.c", "Head of Department"),
    directoryResolution("dean_review", "Sunethra Ratnayake", "u18@u.c", "Dean"),
  ];
}

export function engineContext(definition: WorkflowDefinition, overrides: Partial<TaskEngineContext> = {}): TaskEngineContext {
  return { definition, now: TASK_NOW, maxInformationRequestsPerStep: 3, ...overrides };
}

export function buildTaskDocument(
  definition: WorkflowDefinition,
  resolutions: AssigneeResolution[],
  profile: RequesterProfile = sampleRequesterProfile("Kavindu Jayawardena"),
): TaskDocument {
  const plan = compileTaskPlan({ definition, profile, resolutions });
  return {
    _id: new ObjectId(),
    reference: "TASK-2026-00001",
    revision: 0,
    created_by: profile.userId,
    requester: { user_id: profile.userId, full_name: profile.fullName, email: profile.email, units: [] },
    workflow_template_id: "workflow-template",
    workflow_template_version: 1,
    title: definition.title,
    status: TaskStatus.IN_PROGRESS,
    creation_source: TaskCreationSource.SELECTION_SESSION,
    conversation: [],
    steps: plan.steps,
    forms: plan.forms,
    values: plan.values,
    unsupported_inputs: plan.unsupported_inputs,
    audit: [],
    created_at: TASK_NOW,
    updated_at: TASK_NOW,
    completed_at: null,
  };
}
