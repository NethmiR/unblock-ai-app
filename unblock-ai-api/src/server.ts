import { config } from "./config/index.config.js";
import { createApp } from "./app.js";
import { createRequireTaskOwnership } from "./middlewares/require-task-ownership.middleware.js";
import { closeDb } from "./db/mongo.client.js";
import { closePool } from "./db/postgres.client.js";
import { logger } from "./utils/shared/logger.util.js";
import { DraftModel } from "./models/draft.model.js";
import { TemplateModel } from "./models/template.model.js";
import { SelectionSessionModel } from "./models/selection-session.model.js";
import { TaskModel } from "./models/task.model.js";
import { AuditLogModel } from "./models/audit-log.model.js";
import { createLlmAdapter } from "./services/llm-adapter/index.llm-adapter.js";
import { createEmbeddingAdapter } from "./services/embedding-adapter/index.embedding-adapter.js";
import { EmbeddingService } from "./services/embedding.service.js";
import { ValidationService } from "./services/validation.service.js";
import { ExtractionService } from "./services/extraction.service.js";
import { DraftService } from "./services/draft.service.js";
import { WorkflowService } from "./services/workflow.service.js";
import { AuditService } from "./services/audit.service.js";
import { TemplateDeletionLogService } from "./services/template-deletion-log.service.js";
import { createVectorStore } from "./services/vector-store/index.vector-store.js";
import { RetrievalService } from "./services/retrieval.service.js";
import { SelectorService } from "./services/selector.service.js";
import { SelectionService } from "./services/selection.service.js";
import { PlannerService } from "./services/planner.service.js";
import { ExecutionService } from "./services/execution.service.js";
import { NotificationService } from "./services/notification.service.js";
import { ApprovalService } from "./services/approval.service.js";
import { CompletionDocumentService } from "./services/completion-document.service.js";
import { createDocumentRenderer } from "./services/document/index.document.js";
import { createMailer } from "./services/mailer/index.mailer.js";
import { TaskService } from "./services/task.service.js";
import { createUserRepository } from "./repositories/user-repository/index.user-repository.js";
import { createUserSessionRepository } from "./repositories/user-session-repository/index.user-session-repository.js";
import { createTemplateDeletionRepository } from "./repositories/template-deletion-repository/index.template-deletion-repository.js";
import { UserSessionService } from "./services/user-session.service.js";
import { AuthenticationService } from "./services/authentication.service.js";
import { UserService } from "./services/user.service.js";
import { WorkflowController } from "./controllers/workflow.controller.js";
import { DraftController } from "./controllers/draft.controller.js";
import { SelectionController } from "./controllers/selection.controller.js";
import { TaskController } from "./controllers/task.controller.js";
import { ApprovalController } from "./controllers/approval.controller.js";
import { HealthController } from "./controllers/health.controller.js";
import { AuthController } from "./controllers/auth.controller.js";
import { UserSessionController } from "./controllers/user-session.controller.js";
import { UserController } from "./controllers/user.controller.js";

async function main(): Promise<void> {
  const draftModel = new DraftModel();
  const templateModel = new TemplateModel();
  const sessionModel = new SelectionSessionModel();
  const taskModel = new TaskModel();
  const auditLogModel = new AuditLogModel();

  const auditService = new AuditService({ auditLogModel });
  const llmAdapter = createLlmAdapter(config.llm);
  const embeddingAdapter = createEmbeddingAdapter(config.embedding);
  const embeddingService = new EmbeddingService({ embeddingAdapter });
  const validationService = new ValidationService();
  const extractionService = new ExtractionService({ llmAdapter, validationService });
  const draftService = new DraftService({ draftModel });

  const repositoryBackend = config.postgres.repositoryBackend;
  const userRepository = createUserRepository(repositoryBackend);
  const userSessionRepository = createUserSessionRepository(repositoryBackend);
  const templateDeletionRepository = createTemplateDeletionRepository(repositoryBackend);

  const userSessionService = new UserSessionService({ userSessionRepository, authConfig: config.auth });
  const authenticationService = new AuthenticationService({
    userRepository,
    userSessionService,
    authConfig: config.auth,
  });
  const templateDeletionLogService = new TemplateDeletionLogService({ templateDeletionRepository });
  const userService = new UserService({ userRepository, userConfig: config.user });

  const workflowService = new WorkflowService({
    templateModel,
    embeddingService,
    validationService,
    taskModel,
    templateDeletionLog: templateDeletionLogService,
  });

  const vectorStore = createVectorStore(config.retrieval.vectorBackend, {
    templateReader: templateModel,
    templateModel,
    indexName: config.retrieval.atlasIndexName,
  });

  const retrievalService = new RetrievalService({ vectorStore, embeddingService });
  const selectorService = new SelectorService({ llmAdapter });
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
  const documentRenderer = createDocumentRenderer(config.document.format);
  const completionDocumentService = new CompletionDocumentService({ renderer: documentRenderer, config });
  const taskService = new TaskService({
    taskModel,
    selectionService,
    workflowService,
    plannerService,
    executionService,
    notificationService,
    auditService,
    completionDocumentService,
    config,
  });
  const approvalService = new ApprovalService({
    taskModel,
    workflowService,
    executionService,
    notificationService,
    taskService,
    completionDocumentService,
    config,
  });

  const controllers = {
    healthController: new HealthController(),
    workflowController: new WorkflowController({ workflowService, extractionService, validationService, draftService }),
    draftController: new DraftController({ draftService, extractionService, workflowService }),
    selectionController: new SelectionController({ selectionService }),
    taskController: new TaskController({ taskService }),
    approvalController: new ApprovalController({ approvalService }),
    authController: new AuthController({ authenticationService }),
    userSessionController: new UserSessionController({ userSessionService }),
    userController: new UserController({ userService }),
  };

  const app = createApp(controllers, {
    authenticationService,
    routeGuards: { requireTaskOwnership: createRequireTaskOwnership({ taskService }) },
  });
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
