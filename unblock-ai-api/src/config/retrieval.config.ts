import { rawEnv } from "./env.config.js";
import { optionalString, parseEnum, parseNumber } from "../utils/shared/env-parse.util.js";
import type { RetrievalConfig } from "../lib/types/config/config.type.js";

const VECTOR_BACKENDS = ["memory", "atlas"] as const;

export const retrieval: RetrievalConfig = Object.freeze({
  topK: parseNumber("RETRIEVAL_TOP_K", rawEnv.RETRIEVAL_TOP_K, 5),
  aliasBoost: parseNumber("RETRIEVAL_ALIAS_BOOST", rawEnv.RETRIEVAL_ALIAS_BOOST, 0.15),
  maxSelectionRounds: parseNumber("SELECTION_MAX_ROUNDS", rawEnv.SELECTION_MAX_ROUNDS, 2),
  vectorBackend: parseEnum("VECTOR_BACKEND", rawEnv.VECTOR_BACKEND, VECTOR_BACKENDS, "memory"),
  atlasIndexName: optionalString(
    "ATLAS_VECTOR_INDEX",
    rawEnv.ATLAS_VECTOR_INDEX,
    "template_vector_index",
  ),
});
