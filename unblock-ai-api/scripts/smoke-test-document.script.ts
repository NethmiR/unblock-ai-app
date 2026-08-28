import { writeFile } from "node:fs/promises";
import { TaskModel } from "../src/models/task.model.js";
import { TemplateModel } from "../src/models/template.model.js";
import { WorkflowService } from "../src/services/workflow.service.js";
import { EmbeddingService } from "../src/services/embedding.service.js";
import { ValidationService } from "../src/services/validation.service.js";
import { DeletionLogService } from "../src/services/deletion-log.service.js";
import { InMemoryAuthStore } from "../src/services/auth-store/in-memory.auth-store.js";
import { CompletionDocumentService } from "../src/services/completion-document.service.js";
import { createDocumentRenderer } from "../src/services/document/index.document.js";
import { config } from "../src/config/index.config.js";
import { closeDb } from "../src/db/mongo.client.js";

async function smokeTest(): Promise<void> {
  const taskId = process.argv[2];
  if (!taskId) {
    throw new Error("Usage: npm run smoke-test:document -- <task-id> [out.pdf]");
  }

  const taskModel = new TaskModel();
  const task = await taskModel.findById(taskId);
  if (!task) {
    throw new Error(`Task '${taskId}' not found`);
  }

  const workflowService = new WorkflowService({
    templateModel: new TemplateModel(),
    embeddingService: new EmbeddingService(),
    validationService: new ValidationService(),
    taskModel,
    // This script never deletes templates - an in-memory store avoids pulling
    // in a live Postgres connection just to satisfy the constructor.
    deletionLog: new DeletionLogService({ authStore: new InMemoryAuthStore() }),
  });
  const workflow = await workflowService.getDocument(task.workflow_id, task.version);

  const renderer = createDocumentRenderer(config.document.format);
  const completionDocumentService = new CompletionDocumentService({ renderer, config });
  const completedAt = task.completion_document?.generated_at ?? task.updated_at;
  const document = await completionDocumentService.generate(task, workflow, completedAt);
  if (!document) {
    throw new Error("Document generation returned null - check DOCUMENT_ENABLED and the server logs");
  }

  const outPath = process.argv[3] ?? document.filename;
  await writeFile(outPath, document.buffer);

  console.log(`Wrote ${outPath} (${document.byteSize} bytes, sha256 ${document.sha256})`);
}

try {
  await smokeTest();
} catch (err) {
  console.error("Document smoke test failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
