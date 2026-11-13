import type { Collection } from "mongodb";
import { getCollection } from "../db/mongo.client.js";
import { COLLECTIONS } from "../data/constants/collection.constant.js";
import { DatabaseError } from "../errors/database.error.js";
import type { WorkflowTemplateAudience } from "../lib/types/selection/eligibility.type.js";
import type {
  StoredWorkflowDefinitionInput,
  StoredWorkflowTemplateVersionDocument,
  WorkflowTemplateVersionKey,
  WorkflowTemplateVersionDocument,
  WorkflowTemplateVersionSummaryDocument,
} from "../lib/types/workflow-template/workflow-template.type.js";

export class WorkflowTemplateVersionModel {
  private collection(): Promise<Collection<StoredWorkflowTemplateVersionDocument>> {
    return getCollection<StoredWorkflowTemplateVersionDocument>(COLLECTIONS.WORKFLOW_TEMPLATE_VERSIONS);
  }

  async insert(doc: Omit<WorkflowTemplateVersionDocument, "_id">): Promise<WorkflowTemplateVersionDocument> {
    try {
      const versions = await this.collection();
      const { insertedId } = await versions.insertOne(doc as StoredWorkflowTemplateVersionDocument);
      return { ...doc, _id: insertedId };
    } catch (err) {
      throw new DatabaseError("Failed to insert workflow template version", { cause: err });
    }
  }

  async find(workflowTemplateId: string, version: number): Promise<StoredWorkflowTemplateVersionDocument | null> {
    try {
      const versions = await this.collection();
      return await versions.findOne({ workflow_template_id: workflowTemplateId, version });
    } catch (err) {
      throw new DatabaseError("Failed to look up workflow template version", { cause: err });
    }
  }

  async findAudiences(keys: readonly WorkflowTemplateVersionKey[]): Promise<Map<string, WorkflowTemplateAudience>> {
    const audiences = new Map<string, WorkflowTemplateAudience>();
    if (keys.length === 0) return audiences;
    try {
      const versions = await this.collection();
      const rows = await versions
        .find(
          { $or: keys.map((key) => ({ workflow_template_id: key.workflow_template_id, version: key.version })) },
          { projection: { workflow_template_id: 1, "definition.scope.applies_to": 1 } },
        )
        .toArray();
      for (const row of rows) {
        const appliesTo: StoredWorkflowDefinitionInput["scope"]["applies_to"] = row.definition.scope.applies_to;
        audiences.set(row.workflow_template_id, {
          actorType: appliesTo.actor_type,
          organisationalUnitCodes: appliesTo.organisational_unit_codes ?? [],
        });
      }
      return audiences;
    } catch (err) {
      throw new DatabaseError("Failed to load workflow template audiences", { cause: err });
    }
  }

  async listSummaries(workflowTemplateId: string): Promise<WorkflowTemplateVersionSummaryDocument[]> {
    try {
      const versions = await this.collection();
      return await versions
        .find({ workflow_template_id: workflowTemplateId }, { projection: { prompt: 0, definition: 0 } })
        .sort({ version: -1 })
        .toArray();
    } catch (err) {
      throw new DatabaseError("Failed to list workflow template versions", { cause: err });
    }
  }
}
