import type { LlmFinishReason } from "../../../data/constants/llm.constant.js";

export interface PerfCase {
  id: string;
  label: string;
  input: string;
}

export interface PerfUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  finishReason: LlmFinishReason | null;
}

export interface PerfRecord extends PerfUsage {
  operation: string;
  caseId: string;
  caseLabel: string;
  iteration: number;
  timestamp: string;
  latencyMs: number;
  success: boolean;
  error: string | null;
}

export interface PerfOperation {
  name: string;
  /** Runs once before any case, for operations that need a DB connection or similar shared resource. */
  setup?(): Promise<void> | void;
  /** Runs once after all iterations, to release whatever `setup` acquired. */
  teardown?(): Promise<void> | void;
  loadCases(): Promise<PerfCase[]> | PerfCase[];
  run(testCase: PerfCase): Promise<PerfUsage>;
}
