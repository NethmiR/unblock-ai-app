import type { Collection } from "mongodb";
import { getCollection } from "../db/mongo.client.js";
import { COLLECTIONS } from "../data/constants/collection.constant.js";
import { REVIEW_STATUS } from "../data/constants/status.constant.js";
import { DatabaseError } from "../errors/database.error.js";
import type { ReviewStatus } from "../lib/types/workflow/workflow.type.js";
import type { RetrievalProjection, TemplateDocument } from "../lib/types/template/template.type.js";

export interface AtlasSearchRow {
  workflow_id: string;
  version: number;
  title: string;
  description: string;
  score: number;
  aliases_lower: string[];
  retrieval_summary: TemplateDocument["document"]["retrieval_summary"] | null;
  retrieval_text: string;
}

export class TemplateModel {
  private collection(): Promise<Collection<TemplateDocument>> {
    return getCollection<TemplateDocument>(COLLECTIONS.TEMPLATES);
  }

  async findLatestVersionNumber(workflowId: string): Promise<number> {
    try {
      const templates = await this.collection();
      const latest = await templates.findOne(
        { workflow_id: workflowId },
        { sort: { version: -1 }, projection: { version: 1 } },
      );
      return latest?.version ?? 0;
    } catch (err) {
      throw new DatabaseError("Failed to look up latest template version", { cause: err });
    }
  }

  async demoteLatest(workflowId: string, now: Date): Promise<void> {
    try {
      const templates = await this.collection();
      await templates.updateMany(
        { workflow_id: workflowId, is_latest: true },
        { $set: { is_latest: false, updated_at: now } },
      );
    } catch (err) {
      throw new DatabaseError("Failed to demote latest template", { cause: err });
    }
  }

  async insert(doc: Omit<TemplateDocument, "_id">): Promise<void> {
    try {
      const templates = await this.collection();
      await templates.insertOne(doc as TemplateDocument);
    } catch (err) {
      throw new DatabaseError("Failed to insert template", { cause: err });
    }
  }

  async findOneByIdAndVersion(workflowId: string, version?: number): Promise<TemplateDocument | null> {
    try {
      const templates = await this.collection();
      const query = version
        ? { workflow_id: workflowId, version: Number(version) }
        : { workflow_id: workflowId, is_latest: true };
      return await templates.findOne(query);
    } catch (err) {
      throw new DatabaseError("Failed to look up template", { cause: err });
    }
  }

  async findAll(filters: { institution_type?: string; review_status?: string }): Promise<TemplateDocument[]> {
    try {
      const templates = await this.collection();
      const query: Record<string, unknown> = { is_latest: true };
      if (filters.institution_type) query.institution_type = filters.institution_type;
      if (filters.review_status) query.review_status = filters.review_status;
      return await templates.find(query).sort({ updated_at: -1 }).toArray();
    } catch (err) {
      throw new DatabaseError("Failed to list templates", { cause: err });
    }
  }

  async searchByText(needle: string): Promise<TemplateDocument[]> {
    try {
      const templates = await this.collection();
      const rx = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      return await templates
        .find({ is_latest: true, $or: [{ title: rx }, { description: rx }] })
        .toArray();
    } catch (err) {
      throw new DatabaseError("Failed to search templates", { cause: err });
    }
  }

  async updateReviewStatus(
    workflowId: string,
    version: number,
    reviewStatus: ReviewStatus,
  ): Promise<TemplateDocument | null> {
    try {
      const templates = await this.collection();
      return await templates.findOneAndUpdate(
        { workflow_id: workflowId, version: Number(version) },
        {
          $set: {
            review_status: reviewStatus,
            "document.metadata.review_status": reviewStatus,
            updated_at: new Date(),
          },
        },
        { returnDocument: "after" },
      );
    } catch (err) {
      throw new DatabaseError("Failed to update template review status", { cause: err });
    }
  }

  /**
   * Hard-deletes EVERY version of a workflow, not just the latest.
   *
   * Templates are versioned by insert-and-demote, so removing only the
   * `is_latest` row would resurrect the previous version as an orphan that
   * `findAll` still hides (it filters on `is_latest`) but retrieval no longer
   * ranks - a document nobody can see or manage. Deleting the whole lineage is
   * the only removal that leaves consistent state.
   */
  async deleteAllVersions(workflowId: string): Promise<number> {
    try {
      const templates = await this.collection();
      const { deletedCount } = await templates.deleteMany({ workflow_id: workflowId });
      return deletedCount;
    } catch (err) {
      throw new DatabaseError("Failed to delete template", { cause: err });
    }
  }

  async listForRetrieval(options: { institutionType?: string | null }): Promise<RetrievalProjection[]> {
    try {
      const templates = await this.collection();
      const query: Record<string, unknown> = { is_latest: true, review_status: REVIEW_STATUS.CONFIRMED };
      if (options.institutionType) query.institution_type = options.institutionType;

      return await templates
        .find(query, {
          projection: {
            workflow_id: 1,
            version: 1,
            title: 1,
            description: 1,
            "retrieval.embedding": 1,
            "retrieval.aliases_lower": 1,
            "retrieval.text": 1,
            "document.retrieval_summary": 1,
          },
        })
        .toArray() as unknown as RetrievalProjection[];
    } catch (err) {
      throw new DatabaseError("Failed to list templates for retrieval", { cause: err });
    }
  }

  async vectorSearch(
    queryVector: number[],
    options: { k: number; institutionType?: string | null; indexName: string },
  ): Promise<AtlasSearchRow[]> {
    try {
      const templates = await this.collection();
      const filter: Record<string, unknown> = { is_latest: true, review_status: REVIEW_STATUS.CONFIRMED };
      if (options.institutionType) filter.institution_type = options.institutionType;

      const results = await templates
        .aggregate([
          {
            $vectorSearch: {
              index: options.indexName,
              path: "retrieval.embedding",
              queryVector,
              numCandidates: Math.max(100, options.k * 20),
              limit: options.k,
              filter,
            },
          },
          {
            $project: {
              workflow_id: 1,
              version: 1,
              title: 1,
              description: 1,
              "retrieval.aliases_lower": 1,
              "retrieval.text": 1,
              "document.retrieval_summary": 1,
              score: { $meta: "vectorSearchScore" },
            },
          },
        ])
        .toArray();

      return results.map((row) => ({
        workflow_id: row.workflow_id as string,
        version: row.version as number,
        title: row.title as string,
        description: row.description as string,
        score: row.score as number,
        aliases_lower: (row.retrieval?.aliases_lower ?? []) as string[],
        retrieval_summary: (row.document?.retrieval_summary ?? null) as AtlasSearchRow["retrieval_summary"],
        retrieval_text: row.retrieval?.text as string,
      }));
    } catch (err) {
      throw new DatabaseError("Failed to run vector search", { cause: err });
    }
  }
}
