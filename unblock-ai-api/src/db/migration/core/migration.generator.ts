import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MigrationError } from "../../../errors/migration.error.js";
import { buildMigrationFileName } from "../../../utils/migration/migration-file.util.js";

export class MigrationGenerator {
  constructor(
    private readonly directory: string,
    private readonly template: string,
  ) {}

  async create(name: string, date: Date = new Date()): Promise<string> {
    const filePath = path.join(this.directory, buildMigrationFileName(name, date));
    await mkdir(this.directory, { recursive: true });

    try {
      await writeFile(filePath, this.template, { encoding: "utf-8", flag: "wx" });
    } catch (err) {
      throw new MigrationError(`Failed to create migration file ${filePath}`, { cause: err });
    }
    return filePath;
  }
}
