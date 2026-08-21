import { TemplateModel } from "../src/models/template.model.js";
import { TaskModel } from "../src/models/task.model.js";
import { AuditLogModel } from "../src/models/audit-log.model.js";
import { WorkflowService } from "../src/services/workflow.service.js";
import { EmbeddingService } from "../src/services/embedding.service.js";
import { ExtractionService } from "../src/services/extraction.service.js";
import { ValidationService } from "../src/services/validation.service.js";
import { AuditService } from "../src/services/audit.service.js";
import { closeDb } from "../src/db/mongo.client.js";

const templateModel = new TemplateModel();
const embeddingService = new EmbeddingService();
const validationService = new ValidationService();
const extractionService = new ExtractionService({ validationService });
const workflowService = new WorkflowService({
  templateModel,
  embeddingService,
  validationService,
  taskModel: new TaskModel(),
  auditService: new AuditService({ auditLogModel: new AuditLogModel() }),
});

const summaries = await workflowService.list({});

for (const summary of summaries) {
  const workflow = await workflowService.getDocument(summary.workflow_id);
  if (workflow.retrieval_summary) {
    console.log(`skip   ${summary.workflow_id} (already has a summary)`);
    continue;
  }

  workflow.retrieval_summary = await extractionService.generateRetrievalSummary(workflow);

  const saved = await workflowService.save(workflow);
  console.log(`backfill ${summary.workflow_id} -> v${saved.version}`);
}

await closeDb();
