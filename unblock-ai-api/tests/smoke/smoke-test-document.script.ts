import { writeFile } from "node:fs/promises";
import { TaskModel } from "../../src/models/task.model.js";
import { WorkflowTemplateModel } from "../../src/models/workflow-template.model.js";
import { WorkflowTemplateVersionModel } from "../../src/models/workflow-template-version.model.js";
import { TaskTranscriptService } from "../../src/services/task-transcript.service.js";
import { createDocumentRenderer } from "../../src/services/document/index.document.js";
import { normaliseWorkflowDefinition } from "../../src/utils/workflow/definition-normaliser.util.js";
import { config } from "../../src/config/index.config.js";
import { closeDb } from "../../src/db/mongo.client.js";
import type { WorkflowDefinition } from "../../src/lib/types/workflow/workflow.type.js";

async function loadDefinition(workflowTemplateId: string, version: number): Promise<WorkflowDefinition> {
  const template = await new WorkflowTemplateModel().findById(workflowTemplateId);
  const stored = await new WorkflowTemplateVersionModel().find(workflowTemplateId, version);
  if (!template || !stored) throw new Error(`Workflow template '${workflowTemplateId}' version ${version} not found`);
  return { ...normaliseWorkflowDefinition(stored.definition), title: template.title };
}

async function smokeTest(): Promise<void> {
  const taskId = process.argv[2];
  if (!taskId) throw new Error("Usage: npm run smoke-test:document -- <task-id> [out-file]");

  const task = await new TaskModel().findById(taskId);
  if (!task) throw new Error(`Task '${taskId}' not found`);

  const definition = await loadDefinition(task.workflow_template_id, task.workflow_template_version);
  const transcriptService = new TaskTranscriptService({
    renderer: createDocumentRenderer(config.document.format),
    documentConfig: { ...config.document, enabled: true },
    workflowTemplateService: { getDefinition: async () => definition },
  });
  const transcript = await transcriptService.render(task, definition);
  if (!transcript) throw new Error("Transcript rendering returned null - check the server logs");

  const outPath = process.argv[3] ?? transcript.filename;
  await writeFile(outPath, transcript.buffer);
  console.log(`Wrote ${outPath} (${transcript.byteSize} bytes, sha256 ${transcript.sha256})`);
}

try {
  await smokeTest();
} catch (err) {
  console.error("Document smoke test failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
