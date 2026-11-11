import { SeedGenerator } from "./seed.generator.js";
import { SeedLoader } from "./seed.loader.js";
import { SeedRunner } from "./seed.runner.js";

export interface SeedEngineOptions<TContext> {
  label: string;
  directory: string;
  template: string;
  createContext: () => Promise<TContext>;
  close: () => Promise<void>;
}

export interface SeedEngine<TContext> {
  readonly label: string;
  readonly runner: SeedRunner<TContext>;
  readonly generator: SeedGenerator;
  close(): Promise<void>;
}

export function createSeedEngine<TContext>({
  label,
  directory,
  template,
  createContext,
  close,
}: SeedEngineOptions<TContext>): SeedEngine<TContext> {
  return {
    label,
    runner: new SeedRunner({ source: new SeedLoader<TContext>(directory), createContext }),
    generator: new SeedGenerator(directory, template),
    close,
  };
}
