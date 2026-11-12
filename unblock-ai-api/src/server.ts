import { config } from "./config/index.config.js";
import { createApp } from "./app.js";
import { createRequireTaskOwnership } from "./middlewares/require-task-ownership.middleware.js";
import { closeDb } from "./db/mongo.client.js";
import { closePool } from "./db/postgres.client.js";
import { logger } from "./utils/shared/logger.util.js";
import { WorkflowTemplateModel } from "./models/workflow-template.model.js";
import { WorkflowTemplateVersionModel } from "./models/workflow-template-version.model.js";
import { SelectionSessionModel } from "./models/selection-session.model.js";
import { TaskModel } from "./models/task.model.js";
import { AuditLogModel } from "./models/audit-log.model.js";
import { createLlmAdapter } from "./services/llm-adapter/index.llm-adapter.js";
import { createEmbeddingAdapter } from "./services/embedding-adapter/index.embedding-adapter.js";
import { EmbeddingService } from "./services/embedding.service.js";
import { ValidationService } from "./services/validation.service.js";
import { WorkflowTemplateGenerationService } from "./services/workflow-template-generation.service.js";
import { WorkflowTemplateService } from "./services/workflow-template.service.js";
import { AuditService } from "./services/audit.service.js";
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
import { createRepositoryRegistry } from "./repositories/repository-registry.factory.js";
import { UserSessionService } from "./services/user-session.service.js";
import { AuthenticationService } from "./services/authentication.service.js";
import { UserService } from "./services/user.service.js";
import { OrganisationalUnitService } from "./services/organisational-unit.service.js";
import { DesignationService } from "./services/designation.service.js";
import { UserAffiliationService } from "./services/user-affiliation.service.js";
import { WorkflowTemplateController } from "./controllers/workflow-template.controller.js";
import { SelectionController } from "./controllers/selection.controller.js";
import { TaskController } from "./controllers/task.controller.js";
import { ApprovalController } from "./controllers/approval.controller.js";
import { HealthController } from "./controllers/health.controller.js";
import { AuthController } from "./controllers/auth.controller.js";
import { UserSessionController } from "./controllers/user-session.controller.js";
import { UserController } from "./controllers/user.controller.js";
import { OrganisationalUnitController } from "./controllers/organisational-unit.controller.js";
import { DesignationController } from "./controllers/designation.controller.js";
import { UserAffiliationController } from "./controllers/user-affiliation.controller.js";

async function main(): Promise<void> {
  const workflowTemplateModel = new WorkflowTemplateModel();
  const workflowTemplateVersionModel = new WorkflowTemplateVersionModel();
  const sessionModel = new SelectionSessionModel();
  const taskModel = new TaskModel();
  const auditLogModel = new AuditLogModel();

  const auditService = new AuditService({ auditLogModel });
  const llmAdapter = createLlmAdapter(config.llm);
  const embeddingAdapter = createEmbeddingAdapter(config.embedding);
  const embeddingService = new EmbeddingService({ embeddingAdapter });
  const validationService = new ValidationService();
  const workflowTemplateGenerationService = new WorkflowTemplateGenerationService({ llmAdapter, validationService });

  const {
    userRepository,
    userSessionRepository,
    organisationalUnitRepository,
    designationRepository,
    userAffiliationRepository,
  } = createRepositoryRegistry(config.postgres.repositoryBackend);

  const userSessionService = new UserSessionService({ userSessionRepository, authConfig: config.auth });
  const authenticationService = new AuthenticationService({
    userRepository,
    userSessionService,
    authConfig: config.auth,
  });
  const userService = new UserService({ userRepository, userAffiliationRepository, userConfig: config.user });
  const organisationalUnitService = new OrganisationalUnitService({ organisationalUnitRepository });
  const designationService = new DesignationService({ designationRepository });
  const userAffiliationService = new UserAffiliationService({
    userAffiliationRepository,
    organisationalUnitRepository,
    designationRepository,
    userRepository,
  });

  const workflowTemplateService = new WorkflowTemplateService({
    workflowTemplateModel,
    workflowTemplateVersionModel,
    generationService: workflowTemplateGenerationService,
    embeddingService,
    userRepository,
  });

  const vectorStore = createVectorStore(config.retrieval.vectorBackend, {
    workflowTemplateModel,
    indexName: config.retrieval.atlasIndexName,
  });

  const retrievalService = new RetrievalService({ vectorStore, embeddingService });
  const selectorService = new SelectorService({ llmAdapter });
  const selectionService = new SelectionService({
    retrievalService,
    selectorService,
    sessionModel,
    workflowTemplateService,
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
    workflowTemplateService,
    plannerService,
    executionService,
    notificationService,
    auditService,
    completionDocumentService,
    config,
  });
  const approvalService = new ApprovalService({
    taskModel,
    workflowTemplateService,
    executionService,
    notificationService,
    taskService,
    completionDocumentService,
    config,
  });

  const controllers = {
    healthController: new HealthController(),
    workflowTemplateController: new WorkflowTemplateController({ workflowTemplateService }),
    selectionController: new SelectionController({ selectionService }),
    taskController: new TaskController({ taskService }),
    approvalController: new ApprovalController({ approvalService }),
    authController: new AuthController({ authenticationService }),
    userSessionController: new UserSessionController({ userSessionService }),
    userController: new UserController({ userService }),
    organisationalUnitController: new OrganisationalUnitController({ organisationalUnitService }),
    designationController: new DesignationController({ designationService }),
    userAffiliationController: new UserAffiliationController({ userAffiliationService }),
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
