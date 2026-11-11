import { SeedError } from "../../../errors/seed.error.js";
import type {
  ISeedSource,
  SeedRunOptions,
  SeedRunReport,
  SeederDefinition,
} from "../../../lib/types/seed/seed.type.js";

export interface SeedRunnerOptions<TContext> {
  source: ISeedSource<TContext>;
  createContext: () => Promise<TContext>;
}

export class SeedRunner<TContext> {
  private readonly source: ISeedSource<TContext>;
  private readonly createContext: () => Promise<TContext>;

  constructor({ source, createContext }: SeedRunnerOptions<TContext>) {
    this.source = source;
    this.createContext = createContext;
  }

  async list(): Promise<string[]> {
    return (await this.source.load()).map(({ name }) => name);
  }

  async run(options: SeedRunOptions = {}): Promise<SeedRunReport[]> {
    const selected = this.select(await this.source.load(), options.only);
    if (selected.length === 0) return [];

    const context = await this.createContext();
    const reports: SeedRunReport[] = [];

    for (const { name, seeder } of selected) {
      try {
        reports.push({ seeder: name, outcomes: await seeder.run(context) });
      } catch (err) {
        throw new SeedError(`Seeder ${name} failed`, {
          cause: err,
          details: { completed: reports.map(({ seeder: completed }) => completed) },
        });
      }
    }
    return reports;
  }

  private select(
    definitions: SeederDefinition<TContext>[],
    only: string | undefined,
  ): SeederDefinition<TContext>[] {
    if (only === undefined) return definitions;

    const match = definitions.filter(({ name }) => name === only);
    if (match.length === 0) {
      throw new SeedError(`No seeder named "${only}"`, {
        details: { available: definitions.map(({ name }) => name) },
      });
    }
    return match;
  }
}
