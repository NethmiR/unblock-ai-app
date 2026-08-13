import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { WorkflowDefinition } from "../../src/lib/types/workflow/workflow.type.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.join(__dirname, "..", "..", "src", "data", "samples");
const EXPECTED_DIR = path.join(SAMPLES_DIR, "expected");
const INPUT_DIR = path.join(SAMPLES_DIR, "input");

export function expectedFixtureNames(): string[] {
  return readdirSync(EXPECTED_DIR);
}

export function loadExpectedFixture(name: string): WorkflowDefinition {
  return JSON.parse(readFileSync(path.join(EXPECTED_DIR, name), "utf-8")) as WorkflowDefinition;
}

export function readInputFixture(name: string): string {
  return readFileSync(path.join(INPUT_DIR, name), "utf-8");
}

export function stepById<T extends { steps: Array<{ id: string }> }>(
  workflow: T,
  id: string,
): T["steps"][number] | undefined {
  return workflow.steps.find((step) => step.id === id);
}
