export enum AiProvider {
  AZURE_OPENAI = "azure-openai",
  GEMINI = "gemini",
  VOYAGE_AI = "voyage-ai",
}

export type LlmProvider = AiProvider.AZURE_OPENAI | AiProvider.GEMINI;

export type EmbeddingProvider = AiProvider.AZURE_OPENAI | AiProvider.GEMINI | AiProvider.VOYAGE_AI;

export const LLM_PROVIDERS: readonly LlmProvider[] = [AiProvider.AZURE_OPENAI, AiProvider.GEMINI];

export const EMBEDDING_PROVIDERS: readonly EmbeddingProvider[] = [
  AiProvider.AZURE_OPENAI,
  AiProvider.GEMINI,
  AiProvider.VOYAGE_AI,
];
