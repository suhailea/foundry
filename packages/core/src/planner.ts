import type { StreamEvent } from '@foundry/shared';

// The Planner port. The scripted planner (A3) and LLM planner (B1) both implement this.
// The engine never knows which one it's using.

export type ToolCall = {
  toolName: string;
  args: unknown;
};

export type Decision =
  | { kind: 'call_tools'; tools: ToolCall[] }
  | { kind: 'delegate'; agentId: string }
  | { kind: 'ask_human'; prompt: string }
  | { kind: 'final_answer'; answer: string };

export interface RunContext {
  runId: string;
  tenantId: string;
  input: string;
  stepCount: number;
  events: StreamEvent[];
  lastToolResult?: unknown;
}

export interface Planner {
  decide(context: RunContext): Promise<Decision>;
}
