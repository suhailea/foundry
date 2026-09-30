import type { Decision, Planner, RunContext } from './planner.js';

export interface ScriptedStep {
  decision: Decision;
  // Called before this step executes, receives the previous step's tool result.
  // May mutate step.decision to dynamically choose what to do next.
  // Throw to abort the run with a meaningful error.
  assert?: (step: ScriptedStep, lastResult: unknown) => void;
}

export class ScriptedPlanner implements Planner {
  private steps: ScriptedStep[];

  constructor(steps: ScriptedStep[]) {
    if (steps.length === 0) {
      throw new Error('ScriptedPlanner requires at least one step');
    }
    this.steps = steps;
  }

  async decide(context: RunContext): Promise<Decision> {
    const step = this.steps[context.stepCount];

    if (!step) {
      return { kind: 'final_answer', answer: '' };
    }

    if (step.assert) {
      step.assert(step, context.lastToolResult);
    }

    return step.decision;
  }
}
