import { config } from "./config/index.config.js";
import { createApp } from "./app.js";
import { ensureIndexes } from "./db/index.definition.js";
import { closeDb } from "./db/mongo.client.js";
import { closePool } from "./db/postgres.client.js";
import { logger } from "./utils/shared/logger.util.js";
import { DraftModel } from "./models/draft.model.js";
import { TemplateModel } from "./models/template.model.js";
import { SelectionSessionModel } from "./models/selection-session.model.js";
import { TaskModel } from "./models/task.model.js";
import { AuditLogModel } from "./models/audit-log.model.js";
import { EmbeddingService } from "./services/embedding.service.js";
import { ValidationService } from "./services/validation.service.js";
import { ExtractionService } from "./services/extraction.service.js";
import { DraftService } from "./services/draft.service.js";
import { WorkflowService } from "./services/workflow.service.js";
import { AuditService } from "./services/audit.service.js";
import { DeletionLogService } from "./services/deletion-log.service.js";
import { createVectorStore } from "./services/vector-store/index.vector-store.js";
import { RetrievalService } from "./services/retrieval.service.js";
import { SelectorService } from "./services/selector.service.js";
import { SelectionService } from "./services/selection.service.js";
import { PlannerService } from "./services/planner.service.js";
import { ExecutionService } from "./services/execution.service.js";
import { NotificationService } from "./services/notification.service.js";
import { ApprovalService } from "./services/approval.service.js";
import { createMailer } from "./services/mailer/index.mailer.js";
import { TaskService } from "./services/task.service.js";
import { createAuthStore } from "./services/auth-store/index.auth-store.js";
import { AuthService } from "./services/auth.service.js";
import { WorkflowController } from "./controllers/workflow.controller.js";
import { DraftController } from "./controllers/draft.controller.js";
import { SelectionController } from "./controllers/selection.controller.js";
import { TaskController } from "./controllers/task.controller.js";
import { ApprovalController } from "./controllers/approval.controller.js";
import { HealthController } from "./controllers/health.controller.js";
import { AuthController } from "./controllers/auth.controller.js";

async function main(): Promise<void> {
  const draftModel = new DraftModel();
  const templateModel = new TemplateModel();
  const sessionModel = new SelectionSessionModel();
  const taskModel = new TaskModel();
  const auditLogModel = new AuditLogModel();

  const auditService = new AuditService({ auditLogModel });
  const embeddingService = new EmbeddingService();
  const validationService = new ValidationService();
  const extractionService = new ExtractionService({ validationService });
  const draftService = new DraftService({ draftModel });

  const authStore = createAuthStore(config.auth.storeBackend);
  const authService = new AuthService({ authStore, config });
  const deletionLogService = new DeletionLogService({ authStore });

  const workflowService = new WorkflowService({
    templateModel,
    embeddingService,
    validationService,
    taskModel,
    deletionLog: deletionLogService,
  });

  const vectorStore = createVectorStore(config.retrieval.vectorBackend, {
    templateReader: templateModel,
    templateModel,
    indexName: config.retrieval.atlasIndexName,
  });

  const retrievalService = new RetrievalService({ vectorStore, embeddingService });
  const selectorService = new SelectorService();
  const selectionService = new SelectionService({
    retrievalService,
    selectorService,
    sessionModel,
    workflowService,
  });
  const plannerService = new PlannerService();
  const mailer = createMailer(config.mail.transport, config.mail);
  const notificationService = new NotificationService({ mailer, config });
  const executionService = new ExecutionService();
  const taskService = new TaskService({
    taskModel,
    selectionService,
    workflowService,
    plannerService,
    executionService,
    notificationService,
    auditService,
    config,
  });
  const approvalService = new ApprovalService({
    taskModel,
    workflowService,
    executionService,
    notificationService,
    taskService,
    config,
  });

  const controllers = {
    healthController: new HealthController(),
    workflowController: new WorkflowController({ workflowService, extractionService, validationService, draftService }),
    draftController: new DraftController({ draftService, extractionService, workflowService }),
    selectionController: new SelectionController({ selectionService }),
    taskController: new TaskController({ taskService }),
    approvalController: new ApprovalController({ approvalService }),
    authController: new AuthController({ authService }),
  };

  await ensureIndexes();

  const app = createApp(controllers, { authService });
  const server = app.listen(config.server.port, () => {
    logger.info(`Server listening on port ${config.server.port}`);
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      logger.info("shutting down", { signal });
      server.close();
      await closeDb();
      await closePool();
      process.exit(0);
    });
  }

  process.on("unhandledRejection", (reason) => {
    logger.error("unhandled rejection", { reason: reason instanceof Error ? reason.stack : String(reason) });
    process.exit(1);
  });

  process.on("uncaughtException", (err) => {
    logger.error("uncaught exception", { message: err.message, stack: err.stack });
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error("failed to start server", { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
