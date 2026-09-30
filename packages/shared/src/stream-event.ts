import { z } from 'zod';

// Stream event types — discriminated union.
// Future phases add new variants; old clients ignore unknown types.

export const RunStartedEventSchema = z.object({
  type: z.literal('run.started'),
  runId: z.string().uuid(),
  timestamp: z.string().datetime(),
});

export const TokenEventSchema = z.object({
  type: z.literal('token'),
  runId: z.string().uuid(),
  token: z.string(),
  timestamp: z.string().datetime(),
});

export const RunCompletedEventSchema = z.object({
  type: z.literal('run.completed'),
  runId: z.string().uuid(),
  timestamp: z.string().datetime(),
});

export const RunFailedEventSchema = z.object({
  type: z.literal('run.failed'),
  runId: z.string().uuid(),
  reason: z.string(),
  timestamp: z.string().datetime(),
});

// A2 tool events
export const ToolRequestedEventSchema = z.object({
  type: z.literal('tool.requested'),
  toolName: z.string(),
  args: z.record(z.unknown()),
});

export const ToolResultEventSchema = z.object({
  type: z.literal('tool.result'),
  toolName: z.string(),
  ok: z.boolean(),
  summary: z.string().optional(),
});

// A4 approval events
export const ApprovalRequiredEventSchema = z.object({
  type: z.literal('approval.required'),
  approvalId: z.string().uuid(),
  toolName: z.string(),
  args: z.record(z.unknown()),
  riskLevel: z.enum(['write', 'high']),
});

export const ApprovalResolvedEventSchema = z.object({
  type: z.literal('approval.resolved'),
  approvalId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().optional(),
});

export const StreamEventSchema = z.discriminatedUnion('type', [
  RunStartedEventSchema,
  TokenEventSchema,
  RunCompletedEventSchema,
  RunFailedEventSchema,
  ToolRequestedEventSchema,
  ToolResultEventSchema,
  ApprovalRequiredEventSchema,
  ApprovalResolvedEventSchema,
]);

export type StreamEvent = z.infer<typeof StreamEventSchema>;
export type RunStartedEvent = z.infer<typeof RunStartedEventSchema>;
export type TokenEvent = z.infer<typeof TokenEventSchema>;
export type RunCompletedEvent = z.infer<typeof RunCompletedEventSchema>;
export type RunFailedEvent = z.infer<typeof RunFailedEventSchema>;
export type ToolRequestedEvent = z.infer<typeof ToolRequestedEventSchema>;
export type ToolResultEvent = z.infer<typeof ToolResultEventSchema>;
export type ApprovalRequiredEvent = z.infer<typeof ApprovalRequiredEventSchema>;
export type ApprovalResolvedEvent = z.infer<typeof ApprovalResolvedEventSchema>;
