import type { PerfOperation, PerfRecord } from "../../../src/lib/types/perf/perf.type.js";

export interface PerfRunOptions {
  iterations: number;
  intervalMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs every case for `iterations` rounds, one request at a time, waiting
 * `intervalMs` between requests so the suite stays under the model's rate
 * limits regardless of how many cases or operations are involved.
 */
export async function runPerfSuite(operation: PerfOperation, options: PerfRunOptions): Promise<PerfRecord[]> {
  await operation.setup?.();

  try {
    const cases = await operation.loadCases();
    const records: PerfRecord[] = [];
    let isFirstRequest = true;

    for (let iteration = 1; iteration <= options.iterations; iteration++) {
      for (const testCase of cases) {
        if (!isFirstRequest) {
          await sleep(options.intervalMs);
        }
        isFirstRequest = false;

        const timestamp = new Date().toISOString();
        console.log(`[${operation.name}] iteration ${iteration}/${options.iterations} - ${testCase.id}`);

        const startedAt = performance.now();
        try {
          const usage = await operation.run(testCase);
          records.push({
            operation: operation.name,
            caseId: testCase.id,
            caseLabel: testCase.label,
            iteration,
            timestamp,
            latencyMs: performance.now() - startedAt,
            success: true,
            error: null,
            ...usage,
          });
        } catch (err) {
          records.push({
            operation: operation.name,
            caseId: testCase.id,
            caseLabel: testCase.label,
            iteration,
            timestamp,
            latencyMs: performance.now() - startedAt,
            success: false,
            error: err instanceof Error ? err.message : String(err),
            inputTokens: null,
            outputTokens: null,
            totalTokens: null,
            finishReason: null,
          });
        }
      }
    }

    return records;
  } finally {
    await operation.teardown?.();
  }
}
