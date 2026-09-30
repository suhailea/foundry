import { z } from 'zod';

export const RunStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_approval',
  'completed',
  'failed',
  'cancelled',
]);

export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  status: RunStatusSchema,
  input: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Run = z.infer<typeof RunSchema>;

export const CreateRunInputSchema = z.object({
  input: z.string().min(1).max(10_000),
});

export type CreateRunInput = z.infer<typeof CreateRunInputSchema>;
