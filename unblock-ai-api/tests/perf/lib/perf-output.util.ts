import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PerfRecord } from "../../../src/lib/types/perf/perf.type.js";

const RESULTS_ROOT = path.join("tests", "perf", "results");

function toCsvValue(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function toCsv(records: PerfRecord[]): string {
  if (records.length === 0) return "";
  const columns = Object.keys(records[0] as object);
  const lines = records.map((record) => columns.map((col) => toCsvValue((record as never)[col])).join(","));
  return [columns.join(","), ...lines].join("\n");
}

function versionStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Writes one timestamped JSON + CSV pair per run under
 * `tests/perf/results/<operation>/`, so past runs are never overwritten.
 */
export async function writePerfResults(operation: string, records: PerfRecord[]): Promise<{ json: string; csv: string }> {
  const dir = path.join(RESULTS_ROOT, operation);
  await mkdir(dir, { recursive: true });

  const stamp = versionStamp();
  const jsonPath = path.join(dir, `${stamp}.json`);
  const csvPath = path.join(dir, `${stamp}.csv`);

  await writeFile(jsonPath, JSON.stringify(records, null, 2), "utf8");
  await writeFile(csvPath, toCsv(records), "utf8");

  return { json: jsonPath, csv: csvPath };
}
