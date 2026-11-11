import type { AiProvider } from "../../../data/constants/ai-provider.constant.js";
import type { RepositoryBackend } from "../../../data/constants/repository.constant.js";

export interface ServerConfig {
  port: number;
  corsOrigins: string[];
  nodeEnv: "development" | "production" | "test";
}

export interface DbConfig {
  uri: string;
  dbName: string;
  serverSelectionTimeoutMs: number;
}

export interface PostgresConfig {
  url: string;
  poolMax: number;
  connectionTimeoutMs: number;
  repositoryBackend: RepositoryBackend;
}

export interface AzureOpenAIConnectionConfig {
  endpoint: string;
  apiKey: string;
  apiVersion: string;
  deployment: string;
}

export interface GeminiConnectionConfig {
  apiKey: string;
  model: string;
}

export type AiProviderConnectionConfig =
  | { provider: AiProvider.AZURE_OPENAI; azureOpenAI: AzureOpenAIConnectionConfig }
  | { provider: AiProvider.GEMINI; gemini: GeminiConnectionConfig };

export type LlmConfig = AiProviderConnectionConfig;

export type EmbeddingConfig = { dimensions: number } & AiProviderConnectionConfig;

export interface ExtractionConfig {
  maxAttempts: number;
}

export interface RetrievalConfig {
  topK: number;
  aliasBoost: number;
  maxSelectionRounds: number;
  vectorBackend: "memory" | "atlas";
  atlasIndexName: string;
}

export interface MailConfig {
  transport: "console" | "brevo";
  from: string;
  brevoApiKey: string;
  appPublicUrl: string;
  tokenSecret: string;
  tokenTtlDays: number;
}

export interface AuthConfig {
  sessionTtlHours: number;
  maxFailedAttempts: number;
  lockoutDurationMinutes: number;
}

export interface UserConfig {
  defaultPassword: string;
}

export interface SeedConfig {
  administratorEmail: string;
  administratorFullName: string;
}

export interface DocumentConfig {
  enabled: boolean;
  attachToEmail: boolean;
  format: "pdf" | "text";
  institutionName: string;
  maxAttachmentBytes: number;
}

export interface AppConfig {
  server: ServerConfig;
  db: DbConfig;
  postgres: PostgresConfig;
  llm: LlmConfig;
  embedding: EmbeddingConfig;
  extraction: ExtractionConfig;
  retrieval: RetrievalConfig;
  mail: MailConfig;
  auth: AuthConfig;
  user: UserConfig;
  document: DocumentConfig;
}
