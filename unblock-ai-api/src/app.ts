import express, { type Express } from "express";
import { createApiRouter, type ApiControllers, type ApiRouteGuards } from "./routes/index.route.js";
import { requestId } from "./middlewares/request-id.middleware.js";
import { requestLogger } from "./middlewares/request-logger.middleware.js";
import { cors } from "./middlewares/cors.middleware.js";
import { jsonBody } from "./middlewares/json-body.middleware.js";
import { createAuthenticateMiddleware } from "./middlewares/authenticate.middleware.js";
import { notFound } from "./middlewares/not-found.middleware.js";
import { errorHandler } from "./middlewares/error-handler.middleware.js";
import type { AuthenticationService } from "./services/authentication.service.js";

export interface AppDependencies {
  authenticationService: AuthenticationService;
  routeGuards: ApiRouteGuards;
}

export function createApp(controllers: ApiControllers, deps: AppDependencies): Express {
  const app = express();
  const authenticate = createAuthenticateMiddleware({ authenticationService: deps.authenticationService });

  app.use(requestId);
  app.use(requestLogger);
  app.use(cors);
  app.use(jsonBody);
  app.use(authenticate);
  app.use("/api", createApiRouter(controllers, deps.routeGuards));
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
