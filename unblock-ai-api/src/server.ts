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
import { createLlmAdapters } from "./services/llm-adapter/index.llm-adapter.js";
import { LlmOperation } from "./data/constants/llm.constant.js";
import { OrganisationCatalogueService } from "./services/organisation-catalogue.service.js";
import { RequesterProfileService } from "./services/requester-profile.service.js";
import { AssigneeResolutionService } from "./services/assignee-resolution.service.js";
import { createAssigneeResolverRegistry } from "./services/assignee-resolution/index.assignee-resolver.js";
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
import { NotificationService } from "./services/notification.service.js";
import { createMailer } from "./services/mailer/index.mailer.js";
import { TaskService } from "./services/task.service.js";
import { TaskEngineService } from "./services/task-engine.service.js";
import { TaskPlanService } from "./services/task-plan.service.js";
import { TaskFormService } from "./services/task-form.service.js";
import { TaskTransitionService } from "./services/task-transition.service.js";
import { TaskEffectExecutorService } from "./services/task-effect-executor.service.js";
import { TaskFormController } from "./controllers/task-form.controller.js";
import { ApprovalController } from "./controllers/approval.controller.js";
import { ApprovalService } from "./services/approval.service.js";
import { ApproverController } from "./controllers/approver.controller.js";
import { ApproverAssignmentService } from "./services/approver-assignment.service.js";
import { TaskTranscriptService } from "./services/task-transcript.service.js";
import { createDocumentRenderer } from "./services/document/index.document.js";
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
  const llmAdapters = createLlmAdapters(config.llm);
  const embeddingAdapter = createEmbeddingAdapter(config.embedding);
  const embeddingService = new EmbeddingService({ embeddingAdapter });
  const validationService = new ValidationService();

  const {
    userRepository,
    userSessionRepository,
    organisationalUnitRepository,
    designationRepository,
    userAffiliationRepository,
  } = createRepositoryRegistry(config.postgres.repositoryBackend);

  const organisationCatalogueService = new OrganisationCatalogueService({ organisationalUnitRepository, designationRepository });
  const requesterProfileService = new RequesterProfileService({ userRepository, userAffiliationRepository });
  const assigneeResolutionService = new AssigneeResolutionService({
    registry: createAssigneeResolverRegistry({ holderLookup: userAffiliationRepository }),
  });
  const workflowTemplateGenerationService = new WorkflowTemplateGenerationService({
    llmAdapter: llmAdapters[LlmOperation.WORKFLOW_TEMPLATE_GENERATION],
    validationService,
    organisationCatalogueService,
    generationConfig: config.workflowTemplateGeneration,
  });

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
  const selectorService = new SelectorService({ llmAdapter: llmAdapters[LlmOperation.WORKFLOW_SELECTION] });
  const selectionService = new SelectionService({
    retrievalService,
    selectorService,
    sessionModel,
    workflowTemplateService,
    workflowTemplateModel,
    workflowTemplateVersionModel,
    requesterProfileService,
    organisationCatalogueService,
    selectionConfig: config.selection,
  });
  const mailer = createMailer(config.mail.transport, config.mail);
  const notificationService = new NotificationService({ mailer, mailConfig: config.mail, documentConfig: config.document });
  const transcriptService = new TaskTranscriptService({
    renderer: createDocumentRenderer(config.document.format),
    documentConfig: config.document,
    workflowTemplateService,
  });
  const taskEngine = new TaskEngineService();
  const effectExecutor = new TaskEffectExecutorService({
    taskModel,
    mailConfig: config.mail,
    notifier: notificationService,
    transcriptRenderer: transcriptService,
  });
  const transitions = new TaskTransitionService({ taskModel, effectExecutor, workflowTemplateService, taskConfig: config.task });
  const taskPlanService = new TaskPlanService({ assigneeResolutionService });
  const taskService = new TaskService({
    taskModel,
    selectionService,
    workflowTemplateService,
    requesterProfileService,
    organisationCatalogueService,
    taskPlanService,
    taskEngine,
    transitions,
    effectExecutor,
    auditService,
  });
  const taskFormService = new TaskFormService({ taskModel, taskEngine, transitions });
  const approvalService = new ApprovalService({ taskModel, taskEngine, transitions, mailConfig: config.mail });
  const approverAssignmentService = new ApproverAssignmentService({ taskModel });
  const serialization = { documentsEnabled: config.document.enabled, isDeletable: TaskService.isDeletable };

  const controllers = {
    healthController: new HealthController(),
    workflowTemplateController: new WorkflowTemplateController({ workflowTemplateService }),
    selectionController: new SelectionController({ selectionService }),
    taskController: new TaskController({ taskService, serialization, transcriptService }),
    taskFormController: new TaskFormController({ taskFormService, serialization }),
    approvalController: new ApprovalController({ approvalService }),
    approverController: new ApproverController({ assignmentService: approverAssignmentService, approvalService }),
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
