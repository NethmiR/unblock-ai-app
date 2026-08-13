import { rawEnv } from "./env.config.js";
import { optionalString, parseEnum, parseNumber } from "../utils/shared/env-parse.util.js";
import type { ServerConfig } from "../lib/types/config/config.type.js";

const NODE_ENVS = ["development", "production", "test"] as const;

export const server: ServerConfig = Object.freeze({
  port: parseNumber("PORT", rawEnv.PORT, 3000),
  corsOrigin: optionalString("CORS_ORIGIN", rawEnv.CORS_ORIGIN, "http://localhost:3001"),
  nodeEnv: parseEnum("NODE_ENV", rawEnv.NODE_ENV, NODE_ENVS, "development"),
});
