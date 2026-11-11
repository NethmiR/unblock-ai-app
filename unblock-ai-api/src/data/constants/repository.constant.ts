export enum RepositoryBackend {
  POSTGRES = "postgres",
  MEMORY = "memory",
}

export const REPOSITORY_BACKENDS: readonly RepositoryBackend[] = Object.values(RepositoryBackend);
