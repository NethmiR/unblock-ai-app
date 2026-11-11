import { rawEnv } from "./env.config.js";
import { requireString } from "../utils/shared/env-parse.util.js";
import type { UserConfig } from "../lib/types/config/config.type.js";

export const user: UserConfig = Object.freeze({
  defaultPassword: requireString("USER_DEFAULT_PASSWORD", rawEnv.USER_DEFAULT_PASSWORD),
});
