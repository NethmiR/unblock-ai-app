import type { Collection, Filter } from "mongodb";
import { getCollection } from "../db/mongo.client.js";
import { COLLECTIONS } from "../data/constants/collection.constant.js";
import { WorkflowTemplateStatus, WorkflowTemplateVisibility } from "../data/constants/workflow-template.constant.js";
import { DatabaseError } from "../errors/database.error.js";
import type {
  WorkflowTemplateCatalogueProjection,
  WorkflowTemplateDocument,
  WorkflowTemplateListOptions,
  WorkflowTemplateRetrievalProjection,
  WorkflowTemplateVectorSearchRow,
} from "../lib/types/workflow-template/workflow-template.type.js";

const RETRIEVAL_PROJECTION = { title: 1, description: 1, current_version: 1, retrieval: 1 } as const;

function retrievableFilter(institutionType: string | null | undefined): Filter<WorkflowTemplateDocument> {
  return {
    status: WorkflowTemplateStatus.PUBLISHED,
    archived_at: null,
    ...(institutionType ? { "retrieval.institution_type": institutionType } : {}),
  };
}

export class WorkflowTemplateModel {
  private collection(): Promise<Collection<WorkflowTemplateDocument>> {
    return getCollection<WorkflowTemplateDocument>(COLLECTIONS.WORKFLOW_TEMPLATES);
  }

  async insert(doc: WorkflowTemplateDocument): Promise<WorkflowTemplateDocument> {
    try {
      const templates = await this.collection();
      await templates.insertOne(doc);
      return doc;
    } catch (err) {
      throw new DatabaseError("Failed to insert workflow template", { cause: err });
    }
  }

  async findById(id: string): Promise<WorkflowTemplateDocument | null> {
    try {
      const templates = await this.collection();
      return await templates.findOne({ _id: id });
    } catch (err) {
      throw new DatabaseError("Failed to look up workflow template", { cause: err });
    }
  }

  async findAll(options: WorkflowTemplateListOptions): Promise<WorkflowTemplateDocument[]> {
    try {
      const templates = await this.collection();
      const filter: Filter<WorkflowTemplateDocument> = {
        ...(options.includeArchived ? {} : { archived_at: null }),
        ...(options.visibility === WorkflowTemplateVisibility.PUBLISHED ? { status: WorkflowTemplateStatus.PUBLISHED } : {}),
      };
      return await templates.find(filter, { projection: { retrieval: 0 } }).sort({ updated_at: -1 }).toArray();
    } catch (err) {
      throw new DatabaseError("Failed to list workflow templates", { cause: err });
    }
  }

  async update(id: string, fields: Partial<Omit<WorkflowTemplateDocument, "_id">>): Promise<WorkflowTemplateDocument | null> {
    try {
      const templates = await this.collection();
      return await templates.findOneAndUpdate({ _id: id }, { $set: fields }, { returnDocument: "after" });
    } catch (err) {
      throw new DatabaseError("Failed to update workflow template", { cause: err });
    }
  }

  async listForRetrieval(options: { institutionType?: string | null }): Promise<WorkflowTemplateRetrievalProjection[]> {
    try {
      const templates = await this.collection();
      return (await templates
        .find(retrievableFilter(options.institutionType), { projection: RETRIEVAL_PROJECTION })
        .toArray()) as unknown as WorkflowTemplateRetrievalProjection[];
    } catch (err) {
      throw new DatabaseError("Failed to list workflow templates for retrieval", { cause: err });
    }
  }

  async listPublishedForCatalogue(): Promise<WorkflowTemplateCatalogueProjection[]> {
    try {
      const templates = await this.collection();
      const rows = await templates
        .find({ ...retrievableFilter(null), current_version: { $ne: null } }, { projection: { title: 1, current_version: 1 } })
        .sort({ title: 1 })
        .toArray();
      return rows.flatMap((row) =>
        row.current_version === null ? [] : [{ _id: row._id, title: row.title, current_version: row.current_version }],
      );
    } catch (err) {
      throw new DatabaseError("Failed to list published workflow templates", { cause: err });
    }
  }

  async vectorSearch(
    queryVector: number[],
    options: { k: number; institutionType?: string | null; indexName: string },
  ): Promise<WorkflowTemplateVectorSearchRow[]> {
    try {
      const templates = await this.collection();
      return (await templates
        .aggregate([
          {
            $vectorSearch: {
              index: options.indexName,
              path: "retrieval.embedding",
              queryVector,
              numCandidates: Math.max(100, options.k * 20),
              limit: options.k * 2,
              filter: {
                status: WorkflowTemplateStatus.PUBLISHED,
                ...(options.institutionType ? { "retrieval.institution_type": options.institutionType } : {}),
              },
            },
          },
          { $match: { archived_at: null } },
          { $limit: options.k },
          { $project: { ...RETRIEVAL_PROJECTION, score: { $meta: "vectorSearchScore" } } },
        ])
        .toArray()) as WorkflowTemplateVectorSearchRow[];
    } catch (err) {
      throw new DatabaseError("Failed to run workflow template vector search", { cause: err });
    }
  }
}
