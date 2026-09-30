import { Hono } from 'hono';
import { db } from '../db.js';
import { runsQueue } from '../queue.js';
import { streamRedis } from '../stream.js';

export const approvals = new Hono();

// POST /v1/approvals/:approvalId/approve
approvals.post('/:approvalId/approve', async (c) => {
  const { approvalId } = c.req.param();
  const tenantId = c.get('tenantId') as string;
  const userId = c.get('userId') as string;

  const result = await db.query(
    `UPDATE approvals
     SET status = 'approved', decision_by = $1, resolved_at = now()
     WHERE id = $2 AND tenant_id = $3 AND status = 'pending'
     RETURNING run_id, tool_name`,
    [userId, approvalId, tenantId],
  );

  if (result.rowCount === 0) {
    return c.json({ error: 'Not found or already resolved' }, 404);
  }

  const { run_id: runId, tool_name: toolName } = result.rows[0];

  // Transition run back to running
  await db.query(
    `UPDATE runs SET status = 'running', updated_at = now() WHERE id = $1 AND tenant_id = $2`,
    [runId, tenantId],
  );

  // Emit approval.resolved to the stream
  await (streamRedis as any).xAdd(`run:${runId}:events`, '*', {
    type: 'approval.resolved',
    data: JSON.stringify({
      runId,
      timestamp: new Date().toISOString(),
      approvalId,
      decision: 'approved',
    }),
  });

  // Re-enqueue the run with the approval decision
  await runsQueue.add(
    'run',
    { runId, tenantId, resume: true, approvalId, approvalDecision: 'approved' },
    { jobId: `${runId}:resume:${approvalId}` },
  );

  return c.json({ ok: true });
});

// POST /v1/approvals/:approvalId/reject
approvals.post('/:approvalId/reject', async (c) => {
  const { approvalId } = c.req.param();
  const tenantId = c.get('tenantId') as string;
  const userId = c.get('userId') as string;
  const body = await c.req.json().catch(() => ({}));
  const reason = (body as { reason?: string }).reason ?? 'Rejected by human';

  const result = await db.query(
    `UPDATE approvals
     SET status = 'rejected', decision_by = $1, reason = $2, resolved_at = now()
     WHERE id = $3 AND tenant_id = $4 AND status = 'pending'
     RETURNING run_id`,
    [userId, reason, approvalId, tenantId],
  );

  if (result.rowCount === 0) {
    return c.json({ error: 'Not found or already resolved' }, 404);
  }

  const { run_id: runId } = result.rows[0];

  // Transition run to failed
  await db.query(
    `UPDATE runs SET status = 'failed', updated_at = now() WHERE id = $1 AND tenant_id = $2`,
    [runId, tenantId],
  );

  // Emit approval.resolved + run.failed
  const now = new Date().toISOString();
  await (streamRedis as any).xAdd(`run:${runId}:events`, '*', {
    type: 'approval.resolved',
    data: JSON.stringify({ runId, timestamp: now, approvalId, decision: 'rejected', reason }),
  });
  await (streamRedis as any).xAdd(`run:${runId}:events`, '*', {
    type: 'run.failed',
    data: JSON.stringify({ runId, timestamp: now, reason }),
  });

  return c.json({ ok: true });
});

// GET /v1/runs/:runId/approvals
approvals.get('/runs/:runId/approvals', async (c) => {
  const { runId } = c.req.param();
  const tenantId = c.get('tenantId') as string;

  const result = await db.query(
    `SELECT id, tool_name, status, reason, created_at, resolved_at
     FROM approvals WHERE run_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
    [runId, tenantId],
  );

  return c.json(result.rows.map((r) => ({
    id: r.id,
    toolName: r.tool_name,
    status: r.status,
    reason: r.reason,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  })));
});
