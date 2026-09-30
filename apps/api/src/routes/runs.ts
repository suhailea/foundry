import { zValidator } from '@hono/zod-validator';
import { CreateRunInputSchema, StreamEventSchema } from '@foundry/shared';
import { Hono } from 'hono';
import { db } from '../db.js';
import { verifySession } from '../lib/jwt.js';
import { runsQueue } from '../queue.js';
import { streamRedis } from '../stream.js';

export const runs = new Hono();

// GET /v1/runs — list runs for the tenant
runs.get('/', async (c) => {
  const tenantId = c.get('tenantId') as string;
  const result = await db.query(
    `SELECT id, tenant_id, status, input, created_at, updated_at
     FROM runs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [tenantId],
  );
  return c.json(result.rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    status: r.status,
    input: r.input,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })));
});

// GET /v1/runs/:runId — get a single run
runs.get('/:runId', async (c) => {
  const { runId } = c.req.param();
  const tenantId = c.get('tenantId') as string;
  const result = await db.query(
    `SELECT id, tenant_id, status, input, created_at, updated_at
     FROM runs WHERE id = $1 AND tenant_id = $2`,
    [runId, tenantId],
  );
  const r = result.rows[0];
  if (!r) return c.json({ error: 'Not found' }, 404);
  return c.json({ id: r.id, tenantId: r.tenant_id, status: r.status, input: r.input, createdAt: r.created_at, updatedAt: r.updated_at });
});

// POST /v1/runs — validate → persist → enqueue → 202
runs.post('/', zValidator('json', CreateRunInputSchema), async (c) => {
  const { input } = c.req.valid('json');

  const tenantId = c.get('tenantId') as string;

  const result = await db.query<{ id: string }>(
    `INSERT INTO runs (tenant_id, input) VALUES ($1, $2) RETURNING id`,
    [tenantId, input],
  );

  const runId = result.rows[0]?.id;
  if (!runId) throw new Error('Failed to insert run');

  await runsQueue.add('run', { runId, tenantId, input }, { jobId: runId });

  return c.json({ runId, status: 'queued' }, 202);
});

// GET /v1/runs/:runId/events — SSE stream tailing Redis Stream
// EventSource cannot send Authorization headers, so token comes as ?token= query param
runs.get('/:runId/events', async (c) => {
  const { runId } = c.req.param();

  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  let session: { tenantId: string };
  try {
    session = await verifySession(token);
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const tenantId = session.tenantId;

  const result = await db.query(
    `SELECT id FROM runs WHERE id = $1 AND tenant_id = $2`,
    [runId, tenantId],
  );
  if (result.rowCount === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  const streamKey = `run:${runId}:events`;
  const encoder = new TextEncoder();

  // Use the Last-Event-ID header to resume. Default to 0-0 (start of stream).
  const lastEventId = c.req.header('Last-Event-ID') ?? '0-0';

  const stream = new ReadableStream({
    async start(controller) {
      let cursor = lastEventId;
      let done = false;

      while (!done) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const messages = await (streamRedis as any).xRead(
          { key: streamKey, id: cursor },
          { BLOCK: 5000, COUNT: 10 },
        );

        if (!messages) continue;

        for (const { messages: entries } of messages) {
          for (const entry of entries) {
            cursor = entry.id;
            const type = entry.message['type'];
            const dataRaw = entry.message['data'];
            if (!type || !dataRaw) continue;

            // Reconstruct the full event object from the two Redis hash fields
            let innerData: Record<string, unknown>;
            try {
              innerData = JSON.parse(dataRaw);
            } catch {
              continue;
            }
            const fullEvent = { type, ...innerData };
            const parsed = StreamEventSchema.safeParse(fullEvent);
            if (!parsed.success) continue;

            controller.enqueue(
              encoder.encode(`id: ${entry.id}\ndata: ${JSON.stringify(fullEvent)}\n\n`),
            );

            if (
              parsed.data.type === 'run.completed' ||
              parsed.data.type === 'run.failed'
            ) {
              done = true;
            }
          }
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});
