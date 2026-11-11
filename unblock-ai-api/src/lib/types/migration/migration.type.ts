import type { Db } from "mongodb";
import type { PoolClient } from "pg";
import type { MigrationState } from "../../../data/constants/migration.constant.js";

export interface Migration<TContext> {
  up(context: TContext): Promise<void>;
  down(context: TContext): Promise<void>;
}

export interface PostgresMigrationContext {
  client: PoolClient;
}

export interface MongoMigrationContext {
  db: Db;
}

export type PostgresMigration = Migration<PostgresMigrationContext>;
export type MongoMigration = Migration<MongoMigrationContext>;

export interface MigrationDefinition<TContext> {
  name: string;
  migration: Migration<TContext>;
}

export interface AppliedMigration {
  name: string;
  batch: number;
  appliedAt: Date;
}

export interface MigrationStatusEntry {
  name: string;
  state: MigrationState;
  batch: number | null;
  appliedAt: Date | null;
}

export interface MigrationRunOptions {
  step?: number;
}

export interface ParsedMigrationFileName {
  name: string;
  timestamp: string;
  slug: string;
  extension: string;
}

export interface IMigrationSource<TContext> {
  load(): Promise<MigrationDefinition<TContext>[]>;
}

export interface IMigrationStore<TContext> {
  initialize(): Promise<void>;
  acquireLock(): Promise<void>;
  releaseLock(): Promise<void>;
  listApplied(): Promise<AppliedMigration[]>;
  apply(definition: MigrationDefinition<TContext>, batch: number): Promise<void>;
  revert(definition: MigrationDefinition<TContext>): Promise<void>;
  close(): Promise<void>;
}
