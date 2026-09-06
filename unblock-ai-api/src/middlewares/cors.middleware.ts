import type { NextFunction, Request, Response } from "express";
import { config } from "../config/index.config.js";

const isDevelopment = config.server.nodeEnv === "development";
const allowedOrigins = new Set(config.server.corsOrigins);

// PRODUCTION NOTE: keep CORS_ORIGIN pinned to the real frontend origin(s), or
// put both behind one reverse proxy and delete this middleware entirely.
export function cors(req: Request, res: Response, next: NextFunction): void {
  const requestOrigin = req.header("origin");

  if (isDevelopment) {
    // Dev: allow any origin, unblocked - reflect the caller's origin when
    // present so tools that require a concrete value (not "*") still work.
    res.header("Access-Control-Allow-Origin", requestOrigin ?? "*");
  } else if (requestOrigin && allowedOrigins.has(requestOrigin)) {
    res.header("Access-Control-Allow-Origin", requestOrigin);
  }
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
}
