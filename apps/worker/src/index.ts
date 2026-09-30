import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { createClient } from 'redis';
import { db } from './db.js';
import { logger } from './lib/logger.js';
import { registerGitHubHandlers, resumeScriptedAgent, runScriptedAgent } from './tool-runner.js';

const redisUrl = process.env['REDIS_URL'];
if (!redisUrl) throw new Error('REDIS_URL is required');

const ioredis = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const streamRedis = createClient({ url: redisUrl });
await streamRedis.connect();

async function setRunStatus(runId: string, status: string) {
  await db.query(
    `UPDATE runs SET status = $1, updated_at = now() WHERE id = $2`,
    [status, runId],
  );
}

const worker = new Worker(
  'runs',
  async (job) => {
    const { runId, tenantId, input, resume, approvalId, approvalDecision } = job.data as {
      runId: string;
      tenantId: string;
      input?: string;
      resume?: boolean;
      approvalId?: string;
      approvalDecision?: 'approved' | 'rejected';
    };

    const log = logger.child({ runId, tenantId });
    const controller = new AbortController();

    registerGitHubHandlers(tenantId);

    if (resume && approvalId && approvalDecision) {
      log.info({ approvalId, approvalDecision }, 'resuming job after approval');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await resumeScriptedAgent(streamRedis as any, runId, tenantId, approvalId, approvalDecision, controller.signal);
      await setRunStatus(runId, approvalDecision === 'approved' ? 'completed' : 'failed');
      return;
    }

    log.info('job picked up');
    await setRunStatus(runId, 'running');

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await runScriptedAgent(streamRedis as any, runId, tenantId, input ?? '', controller.signal);

      // Only mark completed if not waiting for approval
      const statusResult = await db.query(`SELECT status FROM runs WHERE id = $1`, [runId]);
      const currentStatus = statusResult.rows[0]?.status;
      if (currentStatus === 'running') {
        await setRunStatus(runId, 'completed');
      }

      log.info('run completed');
    } catch (err) {
      await setRunStatus(runId, 'failed');
      log.error({ err }, 'run failed');
      throw err;
    }
  },
  { connection: ioredis },
);

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'job failed');
});

logger.info('worker listening for runs');
