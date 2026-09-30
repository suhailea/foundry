import type { RunContext } from './planner.js';

// Checkpoint port — implemented by apps/worker/src/checkpoint-store.ts using pg.
// packages/core never imports pg directly.

export interface CheckpointStore {
  save(runId: string, context: RunContext): Promise<void>;
  load(runId: string): Promise<RunContext | null>;
}
