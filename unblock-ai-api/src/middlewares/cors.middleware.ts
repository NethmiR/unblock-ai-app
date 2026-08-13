import type { NextFunction, Request, Response } from "express";
import { config } from "../config/index.config.js";

// PRODUCTION NOTE: replace the wildcard with the real frontend origin, or put
// both behind one reverse proxy and delete this middleware entirely.
export function cors(req: Request, res: Response, next: NextFunction): void {
  res.header("Access-Control-Allow-Origin", config.server.corsOrigin);
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
}
