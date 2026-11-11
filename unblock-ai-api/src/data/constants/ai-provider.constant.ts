export enum AiProvider {
  AZURE_OPENAI = "azure-openai",
  GEMINI = "gemini",
}

export const AI_PROVIDERS: readonly AiProvider[] = Object.values(AiProvider);
