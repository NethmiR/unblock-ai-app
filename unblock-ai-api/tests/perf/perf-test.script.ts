import { runPerfSuite } from "./lib/perf-runner.util.js";
import { writePerfResults } from "./lib/perf-output.util.js";
import { workflowTemplateGenerationOperation } from "./operations/workflow-template-generation.operation.js";
import { taskRequestOperation } from "./operations/task-request.operation.js";
import type { PerfOperation, PerfRecord } from "../../src/lib/types/perf/perf.type.js";

/**
 * Registry of measurable operations. Add a new entry here (and a matching
 * file under `operations/`) to extend the suite to another AI request.
 */
const OPERATIONS: Record<string, PerfOperation> = {
  [workflowTemplateGenerationOperation.name]: workflowTemplateGenerationOperation,
  [taskRequestOperation.name]: taskRequestOperation,
};

interface CliOptions {
  operation: string;
  iterations: number;
  intervalMs: number;
}

/**
 * `npm run perf-test --operation=x` (no `--` before the flag) never reaches
 * argv - npm consumes it as its own config flag instead and only exposes it
 * via `npm_config_operation`. Checking both makes both invocation styles work.
 */
function readFlag(flags: Map<string, string>, name: string): string | undefined {
  return flags.get(name) ?? process.env[`npm_config_${name.replace(/-/g, "_")}`];
}

function parseCliOptions(argv: string[]): CliOptions {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) flags.set(match[1] as string, match[2] as string);
  }

  return {
    operation: readFlag(flags, "operation") ?? workflowTemplateGenerationOperation.name,
    iterations: Number(readFlag(flags, "iterations") ?? 5),
    intervalMs: Number(readFlag(flags, "interval-ms") ?? 3000),
  };
}

function printSummary(records: PerfRecord[]): void {
  const byCase = new Map<string, PerfRecord[]>();
  for (const record of records) {
    const group = byCase.get(record.caseId) ?? [];
    group.push(record);
    byCase.set(record.caseId, group);
  }

  const avg = (values: number[]): string =>
    values.length ? (values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(0) : "n/a";

  const rows = [...byCase.entries()].map(([caseId, group]) => {
    const ok = group.filter((r) => r.success);
    return {
      case: caseId,
      runs: group.length,
      failures: group.length - ok.length,
      avgLatencyMs: avg(ok.map((r) => r.latencyMs)),
      avgInputTokens: avg(ok.map((r) => r.inputTokens ?? 0)),
      avgOutputTokens: avg(ok.map((r) => r.outputTokens ?? 0)),
    };
  });

  console.table(rows);
}

const options = parseCliOptions(process.argv.slice(2));
const operation = OPERATIONS[options.operation];

if (!operation) {
  console.error(`Unknown operation "${options.operation}". Available: ${Object.keys(OPERATIONS).join(", ")}`);
  process.exit(1);
}

console.log(
  `Running "${operation.name}" - ${options.iterations} iteration(s), ${options.intervalMs}ms between requests\n`,
);

const records = await runPerfSuite(operation, { iterations: options.iterations, intervalMs: options.intervalMs });
const { json, csv } = await writePerfResults(operation.name, records);

console.log("");
printSummary(records);
console.log(`\nSaved: ${json}\nSaved: ${csv}`);
