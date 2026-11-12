import type { Collection } from "mongodb";
import { getCollection } from "../db/mongo.client.js";
import { COLLECTIONS } from "../data/constants/collection.constant.js";
import { DatabaseError } from "../errors/database.error.js";
import type {
  WorkflowTemplateVersionDocument,
  WorkflowTemplateVersionSummaryDocument,
} from "../lib/types/workflow-template/workflow-template.type.js";

export class WorkflowTemplateVersionModel {
  private collection(): Promise<Collection<WorkflowTemplateVersionDocument>> {
    return getCollection<WorkflowTemplateVersionDocument>(COLLECTIONS.WORKFLOW_TEMPLATE_VERSIONS);
  }

  async insert(doc: Omit<WorkflowTemplateVersionDocument, "_id">): Promise<WorkflowTemplateVersionDocument> {
    try {
      const versions = await this.collection();
      const { insertedId } = await versions.insertOne(doc as WorkflowTemplateVersionDocument);
      return { ...doc, _id: insertedId };
    } catch (err) {
      throw new DatabaseError("Failed to insert workflow template version", { cause: err });
    }
  }

  async find(workflowTemplateId: string, version: number): Promise<WorkflowTemplateVersionDocument | null> {
    try {
      const versions = await this.collection();
      return await versions.findOne({ workflow_template_id: workflowTemplateId, version });
    } catch (err) {
      throw new DatabaseError("Failed to look up workflow template version", { cause: err });
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
