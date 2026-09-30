import { describe, expect, it } from 'vitest';
import { IllegalTransitionError, isTerminal, transition } from './run-state-machine.js';

describe('run state machine', () => {
  it('allows queued → running', () => {
    expect(transition('queued', 'running')).toBe('running');
  });

  it('allows running → completed', () => {
    expect(transition('running', 'completed')).toBe('completed');
  });

  it('allows running → failed', () => {
    expect(transition('running', 'failed')).toBe('failed');
  });

  it('allows running → waiting_approval', () => {
    expect(transition('running', 'waiting_approval')).toBe('waiting_approval');
  });

  it('allows waiting_approval → running', () => {
    expect(transition('waiting_approval', 'running')).toBe('running');
  });

  it('allows cancellation from queued', () => {
    expect(transition('queued', 'cancelled')).toBe('cancelled');
  });

  it('throws on illegal transition: queued → completed', () => {
    expect(() => transition('queued', 'completed')).toThrow(IllegalTransitionError);
  });

  it('throws on illegal transition: completed → running', () => {
    expect(() => transition('completed', 'running')).toThrow(IllegalTransitionError);
  });

  it('throws on illegal transition: failed → running', () => {
    expect(() => transition('failed', 'running')).toThrow(IllegalTransitionError);
  });

  it('identifies terminal states', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
  });

  it('identifies non-terminal states', () => {
    expect(isTerminal('queued')).toBe(false);
    expect(isTerminal('running')).toBe(false);
    expect(isTerminal('waiting_approval')).toBe(false);
  });
});
