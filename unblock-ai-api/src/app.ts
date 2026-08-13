import express, { type Express } from "express";
import { createApiRouter, type ApiControllers } from "./routes/index.route.js";
import { requestId } from "./middlewares/request-id.middleware.js";
import { requestLogger } from "./middlewares/request-logger.middleware.js";
import { cors } from "./middlewares/cors.middleware.js";
import { jsonBody } from "./middlewares/json-body.middleware.js";
import { notFound } from "./middlewares/not-found.middleware.js";
import { errorHandler } from "./middlewares/error-handler.middleware.js";

export function createApp(controllers: ApiControllers): Express {
  const app = express();

  app.use(requestId);
  app.use(requestLogger);
  app.use(cors);
  app.use(jsonBody);
  app.use("/api", createApiRouter(controllers));
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
