import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SeedError } from "../../../errors/seed.error.js";
import { parseSeedFileName } from "../../../utils/seed/seed-file.util.js";
import type { ISeedSource, Seeder, SeederDefinition } from "../../../lib/types/seed/seed.type.js";

const RUNTIME_EXTENSION = path.extname(fileURLToPath(import.meta.url)).slice(1);

function isSeeder(value: unknown): value is Seeder<unknown> {
  return typeof (value as Partial<Seeder<unknown>> | null)?.run === "function";
}

export class SeedLoader<TContext> implements ISeedSource<TContext> {
  constructor(private readonly directory: string) {}

  async load(): Promise<SeederDefinition<TContext>[]> {
    const entries = await this.listFiles();
    const files = entries
      .map((fileName) => ({ fileName, parsed: parseSeedFileName(fileName) }))
      .filter(({ parsed }) => parsed?.extension === RUNTIME_EXTENSION)
      .sort((a, b) => a.fileName.localeCompare(b.fileName));

    return Promise.all(files.map(({ fileName, parsed }) => this.import(fileName, parsed!.name)));
  }

  private async listFiles(): Promise<string[]> {
    try {
      return await readdir(this.directory);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new SeedError(`Failed to read seeders directory ${this.directory}`, { cause: err });
    }
  }

  private async import(fileName: string, name: string): Promise<SeederDefinition<TContext>> {
    const moduleUrl = pathToFileURL(path.join(this.directory, fileName)).href;
    const module = (await import(moduleUrl)) as { default?: unknown };

    if (!isSeeder(module.default)) {
      throw new SeedError(`${fileName} must default-export an object with a run function`);
    }
    return { name, seeder: module.default as Seeder<TContext> };
  }
}
