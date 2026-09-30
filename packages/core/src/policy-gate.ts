import type { ToolCard } from './tool-registry.js';

export type PolicyDecision = 'allow' | 'hitl' | 'block';

export interface PolicyContext {
  tenantId: string;
  runId: string;
}

// Default risk → decision table. Extend this per tenant in A4+.
const RISK_POLICY: Record<string, PolicyDecision> = {
  read: 'allow',
  write: 'allow',
  high: 'hitl',
};

export function policyGate(card: ToolCard, _context: PolicyContext): PolicyDecision {
  return RISK_POLICY[card.risk] ?? 'block';
}
