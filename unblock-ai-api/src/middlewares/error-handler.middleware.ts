import type { NextFunction, Request, Response } from "express";
import { BaseError } from "../errors/index.error.js";
import { logger } from "../utils/shared/logger.util.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof BaseError) {
    logger.warn("handled error", {
      type: err.name,
      code: err.code,
      message: err.message,
      requestId: req.requestId,
    });
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error("unhandled route error", { message, stack, requestId: req.requestId });
  res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR", details: null });
}
