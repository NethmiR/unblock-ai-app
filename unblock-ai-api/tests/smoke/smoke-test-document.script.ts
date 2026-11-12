import { writeFile } from "node:fs/promises";
import { TaskModel } from "../../src/models/task.model.js";
import { WorkflowTemplateModel } from "../../src/models/workflow-template.model.js";
import { WorkflowTemplateVersionModel } from "../../src/models/workflow-template-version.model.js";
import { CompletionDocumentService } from "../../src/services/completion-document.service.js";
import { createDocumentRenderer } from "../../src/services/document/index.document.js";
import { config } from "../../src/config/index.config.js";
import { closeDb } from "../../src/db/mongo.client.js";
import type { TaskDocument } from "../../src/lib/types/task/task.type.js";
import type { WorkflowDefinition } from "../../src/lib/types/workflow/workflow.type.js";

async function loadTaskDefinition(task: TaskDocument): Promise<WorkflowDefinition> {
  const template = await new WorkflowTemplateModel().findById(task.workflow_template_id);
  if (!template) {
    throw new Error(`Workflow template '${task.workflow_template_id}' not found`);
  }
  const version = await new WorkflowTemplateVersionModel().find(task.workflow_template_id, task.workflow_template_version);
  if (!version) {
    throw new Error(`Workflow template '${task.workflow_template_id}' has no version ${task.workflow_template_version}`);
  }
  return { ...version.definition, title: template.title };
}

async function smokeTest(): Promise<void> {
  const taskId = process.argv[2];
  if (!taskId) {
    throw new Error("Usage: npm run smoke-test:document -- <task-id> [out.pdf]");
  }

  const task = await new TaskModel().findById(taskId);
  if (!task) {
    throw new Error(`Task '${taskId}' not found`);
  }

  const workflow = await loadTaskDefinition(task);
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
