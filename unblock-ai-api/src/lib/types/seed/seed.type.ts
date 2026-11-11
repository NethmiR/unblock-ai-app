import type { SeedEntity, SeedOutcomeStatus } from "../../../data/constants/seed.constant.js";

export interface SeedOutcome {
  entity: SeedEntity;
  key: string;
  status: SeedOutcomeStatus;
}

export interface Seeder<TContext> {
  run(context: TContext): Promise<SeedOutcome[]>;
}

export interface SeederDefinition<TContext> {
  name: string;
  seeder: Seeder<TContext>;
}

export interface SeedRunOptions {
  only?: string;
}

export interface SeedRunReport {
  seeder: string;
  outcomes: SeedOutcome[];
}

export interface ParsedSeedFileName {
  name: string;
  timestamp: string;
  slug: string;
  extension: string;
}

export interface ISeedSource<TContext> {
  load(): Promise<SeederDefinition<TContext>[]>;
}
