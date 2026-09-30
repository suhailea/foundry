import type { CheckpointStore, RunContext } from '@foundry/core';
import { db } from './db.js';

export const checkpointStore: CheckpointStore = {
  async save(runId: string, context: RunContext): Promise<void> {
    await db.query(
      `UPDATE runs SET checkpoint = $1, step_count = $2, updated_at = now() WHERE id = $3`,
      [JSON.stringify(context), context.stepCount, runId],
    );
  },

  async load(runId: string): Promise<RunContext | null> {
    const result = await db.query(
      `SELECT checkpoint FROM runs WHERE id = $1`,
      [runId],
    );
    const row = result.rows[0];
    if (!row?.checkpoint) return null;
    return row.checkpoint as RunContext;
  },
};
