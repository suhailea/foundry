import type { RunStatus } from '@foundry/shared';

// Valid transitions for the run state machine.
// Any transition not listed here is illegal and must throw.
const TRANSITIONS: Record<RunStatus, ReadonlyArray<RunStatus>> = {
  queued: ['running', 'cancelled'],
  running: ['waiting_approval', 'completed', 'failed', 'cancelled'],
  waiting_approval: ['running', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

export class IllegalTransitionError extends Error {
  constructor(from: RunStatus, to: RunStatus) {
    super(`Illegal run state transition: ${from} → ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export function transition(current: RunStatus, next: RunStatus): RunStatus {
  const allowed = TRANSITIONS[current];
  if (!allowed.includes(next)) {
    throw new IllegalTransitionError(current, next);
  }
  return next;
}

export function isTerminal(status: RunStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}
