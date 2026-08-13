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

export interface AppConfig {
  server: ServerConfig;
  db: DbConfig;
  azureOpenAI: AzureOpenAIConfig;
  azureEmbedding: AzureEmbeddingConfig;
  retrieval: RetrievalConfig;
}
