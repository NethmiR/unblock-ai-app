export interface ServerConfig {
  port: number;
  corsOrigin: string;
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
}

export interface AzureOpenAIConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
  selectorDeployment: string;
  maxExtractionAttempts: number;
}

export interface AzureEmbeddingConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
  dimensions: number;
}

export interface RetrievalConfig {
  topK: number;
  aliasBoost: number;
  maxSelectionRounds: number;
  vectorBackend: "memory" | "atlas";
  atlasIndexName: string;
}

export interface MailConfig {
  transport: "console" | "smtp";
  from: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  appPublicUrl: string;
  tokenSecret: string;
  tokenTtlDays: number;
}

export interface AuthConfig {
  sessionTokenSecret: string;
  sessionTtlHours: number;
  maxFailedAttempts: number;
  storeBackend: "postgres" | "memory";
}

export interface AppConfig {
  server: ServerConfig;
  db: DbConfig;
  postgres: PostgresConfig;
  azureOpenAI: AzureOpenAIConfig;
  azureEmbedding: AzureEmbeddingConfig;
  retrieval: RetrievalConfig;
  mail: MailConfig;
  auth: AuthConfig;
}
