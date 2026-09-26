/**
 * Execution target interfaces and contracts for pipeline runner.
 */

export interface ExecutionResult {
  success: boolean;
  items: unknown[];
  metadata?: Record<string, unknown>;
  itemCount: number;
  durationMs: number;
  error?: string;
}

export interface ExecutionTarget {
  readonly name: string;
  run(actorId: string, config: Record<string, unknown>): Promise<ExecutionResult>;
}

export * from "./local-executor";
