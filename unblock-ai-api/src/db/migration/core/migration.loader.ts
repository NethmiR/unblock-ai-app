import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MigrationError } from "../../../errors/migration.error.js";
import { parseMigrationFileName } from "../../../utils/migration/migration-file.util.js";
import type {
  IMigrationSource,
  Migration,
  MigrationDefinition,
} from "../../../lib/types/migration/migration.type.js";

const RUNTIME_EXTENSION = path.extname(fileURLToPath(import.meta.url)).slice(1);

function isMigration(value: unknown): value is Migration<unknown> {
  const candidate = value as Partial<Migration<unknown>> | null;
  return typeof candidate?.up === "function" && typeof candidate?.down === "function";
}

export class MigrationLoader<TContext> implements IMigrationSource<TContext> {
  constructor(private readonly directory: string) {}

  async load(): Promise<MigrationDefinition<TContext>[]> {
    const entries = await this.listFiles();
    const files = entries
      .map((fileName) => ({ fileName, parsed: parseMigrationFileName(fileName) }))
      .filter(({ parsed }) => parsed?.extension === RUNTIME_EXTENSION)
      .sort((a, b) => a.fileName.localeCompare(b.fileName));

    return Promise.all(files.map(({ fileName, parsed }) => this.import(fileName, parsed!.name)));
  }

  private async listFiles(): Promise<string[]> {
    try {
      return await readdir(this.directory);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new MigrationError(`Failed to read migrations directory ${this.directory}`, { cause: err });
    }
  }

  private async import(fileName: string, name: string): Promise<MigrationDefinition<TContext>> {
    const moduleUrl = pathToFileURL(path.join(this.directory, fileName)).href;
    const module = (await import(moduleUrl)) as { default?: unknown };

    if (!isMigration(module.default)) {
      throw new MigrationError(`${fileName} must default-export an object with up and down functions`);
    }
    return { name, migration: module.default as Migration<TContext> };
  }
}
