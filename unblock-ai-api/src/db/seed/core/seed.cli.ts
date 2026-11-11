import path from "node:path";
import { parseArgs } from "node:util";
import { SeedError } from "../../../errors/seed.error.js";
import { SeedCommand } from "../../../data/constants/seed.constant.js";
import { describeError } from "../../../utils/shared/error-description.util.js";
import type { SeedEngine } from "./seed.engine.js";
import type { SeedRunReport } from "../../../lib/types/seed/seed.type.js";

const USAGE = `Usage: <command> [options]
  run [--only <name>]   run every seeder in order, or only the named one
  list                  list the discovered seeders
  create <name>         scaffold a new seeder file`;

function printReports(label: string, reports: SeedRunReport[]): void {
  if (reports.length === 0) {
    console.log(`[${label}] no seeders found`);
    return;
  }
  for (const { seeder, outcomes } of reports) {
    if (outcomes.length === 0) console.log(`[${label}] ${seeder} -> nothing to seed`);
    for (const { entity, key, status } of outcomes) {
      console.log(`[${label}] ${seeder} ${entity} ${key} -> ${status}`);
    }
  }
}

function printList(label: string, names: string[]): void {
  if (names.length === 0) {
    console.log(`[${label}] no seeders found`);
    return;
  }
  for (const name of names) console.log(`[${label}] ${name}`);
}

async function execute<TContext>(engine: SeedEngine<TContext>, argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    options: { only: { type: "string" } },
    allowPositionals: true,
  });
  const [command, ...rest] = positionals;
  const { label, runner, generator } = engine;

  switch (command) {
    case SeedCommand.RUN:
      return printReports(label, await runner.run({ only: values.only }));
    case SeedCommand.LIST:
      return printList(label, await runner.list());
    case SeedCommand.CREATE: {
      const filePath = await generator.create(rest.join(" "));
      console.log(`[${label}] created  ${path.relative(process.cwd(), filePath)}`);
      return;
    }
    default:
      throw new SeedError(`Unknown command "${command ?? ""}"\n${USAGE}`);
  }
}

export async function runSeedCli<TContext>(engine: SeedEngine<TContext>, argv: string[]): Promise<void> {
  try {
    await execute(engine, argv);
  } catch (err) {
    process.exitCode = 1;
    console.error(`[${engine.label}] ${describeError(err)}`);
  } finally {
    await engine.close();
  }
}
