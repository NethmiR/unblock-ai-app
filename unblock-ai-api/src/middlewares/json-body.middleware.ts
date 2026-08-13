import express from "express";
import type { RequestHandler } from "express";

export const jsonBody: RequestHandler = express.json({ limit: "1mb" });
