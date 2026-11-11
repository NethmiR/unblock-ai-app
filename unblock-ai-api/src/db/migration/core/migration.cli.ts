import path from "node:path";
import { parseArgs } from "node:util";
import { MigrationError } from "../../../errors/migration.error.js";
import { MigrationCommand } from "../../../data/constants/migration.constant.js";
import { describeError } from "../../../utils/shared/error-description.util.js";
import type { MigrationEngine } from "./migration.engine.js";
import type { MigrationStatusEntry } from "../../../lib/types/migration/migration.type.js";

const USAGE = `Usage: <command> [options]
  up [--step <n>]     apply pending migrations, or only the next <n>
  down [--step <n>]   revert the last batch, or the last <n> migrations
  reset               revert every applied migration
  status              list applied, pending and missing migrations
  create <name>       scaffold a new migration file
  unlock              release a lock left behind by an interrupted run`;

function parseStep(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const step = Number(raw);
  if (!Number.isInteger(step) || step < 1) {
    throw new MigrationError(`--step must be a positive integer, received "${raw}"`);
  }
  return step;
}

function printStatus(label: string, entries: MigrationStatusEntry[]): void {
  if (entries.length === 0) {
    console.log(`[${label}] no migrations found`);
    return;
  }
  const width = Math.max(...entries.map(({ name }) => name.length));
  for (const { state, name, batch, appliedAt } of entries) {
    const batchColumn = `batch ${batch ?? "-"}`.padEnd(10);
    console.log(`[${label}] ${state.padEnd(8)} ${name.padEnd(width)}  ${batchColumn}${appliedAt?.toISOString() ?? ""}`);
  }
}

function printResult(label: string, action: "applied" | "reverted", names: string[]): void {
  if (names.length === 0) {
    console.log(`[${label}] nothing to ${action === "applied" ? "apply" : "revert"}`);
    return;
  }
  for (const name of names) {
    console.log(`[${label}] ${action.padEnd(8)} ${name}`);
  }
}

async function execute<TContext>(engine: MigrationEngine<TContext>, argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    options: { step: { type: "string" } },
    allowPositionals: true,
  });
  const [command, ...rest] = positionals;
  const step = parseStep(values.step);
  const { label, runner, generator } = engine;

  switch (command) {
    case MigrationCommand.UP:
      return printResult(label, "applied", await runner.up({ step }));
    case MigrationCommand.DOWN:
      return printResult(label, "reverted", await runner.down({ step }));
    case MigrationCommand.RESET:
      return printResult(label, "reverted", await runner.reset());
    case MigrationCommand.STATUS:
      return printStatus(label, await runner.status());
    case MigrationCommand.CREATE: {
      const filePath = await generator.create(rest.join(" "));
      console.log(`[${label}] created  ${path.relative(process.cwd(), filePath)}`);
      return;
    }
    case MigrationCommand.UNLOCK:
      await runner.unlock();
      console.log(`[${label}] lock released`);
      return;
    default:
      throw new MigrationError(`Unknown command "${command ?? ""}"\n${USAGE}`);
  }
}

export async function runMigrationCli<TContext>(engine: MigrationEngine<TContext>, argv: string[]): Promise<void> {
  try {
    await execute(engine, argv);
  } catch (err) {
    process.exitCode = 1;
    console.error(`[${engine.label}] ${describeError(err)}`);
  } finally {
    await engine.close();
  }
}
