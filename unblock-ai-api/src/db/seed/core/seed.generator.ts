import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SeedError } from "../../../errors/seed.error.js";
import { buildSeedFileName } from "../../../utils/seed/seed-file.util.js";

export class SeedGenerator {
  constructor(
    private readonly directory: string,
    private readonly template: string,
  ) {}

  async create(name: string, date: Date = new Date()): Promise<string> {
    const filePath = path.join(this.directory, buildSeedFileName(name, date));
    await mkdir(this.directory, { recursive: true });

    try {
      await writeFile(filePath, this.template, { encoding: "utf-8", flag: "wx" });
    } catch (err) {
      throw new SeedError(`Failed to create seeder file ${filePath}`, { cause: err });
    }
    return filePath;
  }
}
