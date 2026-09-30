import { getTool } from './tool-registry.js';
import { policyGate, type PolicyContext } from './policy-gate.js';

export interface ToolResult {
  ok: boolean;
  toolName: string;
  data?: unknown;
  error?: string;
  policyDecision: 'allow' | 'hitl' | 'block';
  durationMs: number;
}

// Handlers are injected by the worker — keeps core free of I/O dependencies.
export type ToolHandler = (args: unknown, signal: AbortSignal) => Promise<unknown>;

const handlers = new Map<string, ToolHandler>();

export function registerHandler(toolName: string, handler: ToolHandler): void {
  handlers.set(toolName, handler);
}

export async function executeTool(
  toolName: string,
  rawArgs: unknown,
  context: PolicyContext,
  signal: AbortSignal,
): Promise<ToolResult> {
  const start = Date.now();

  const card = getTool(toolName);
  if (!card) {
    return { ok: false, toolName, error: `Unknown tool: ${toolName}`, policyDecision: 'block', durationMs: 0 };
  }

  // Validate args with the tool's Zod schema
  const parsed = card.inputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      ok: false,
      toolName,
      error: `Invalid args: ${parsed.error.message}`,
      policyDecision: 'allow',
      durationMs: Date.now() - start,
    };
  }

  // Policy gate
  const decision = policyGate(card, context);
  if (decision === 'block') {
    return { ok: false, toolName, error: 'Blocked by policy', policyDecision: 'block', durationMs: Date.now() - start };
  }
  if (decision === 'hitl') {
    // Return without executing — caller emits approval.required event
    return { ok: false, toolName, error: 'Requires human approval', policyDecision: 'hitl', durationMs: Date.now() - start };
  }

  // Execute
  const handler = handlers.get(toolName);
  if (!handler) {
    return { ok: false, toolName, error: `No handler registered for: ${toolName}`, policyDecision: 'allow', durationMs: Date.now() - start };
  }

  try {
    const data = await handler(parsed.data, signal);
    return { ok: true, toolName, data, policyDecision: 'allow', durationMs: Date.now() - start };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, toolName, error, policyDecision: 'allow', durationMs: Date.now() - start };
  }
}
