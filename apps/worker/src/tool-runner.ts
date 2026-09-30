import { createHash } from 'node:crypto';
import type { RedisClientType } from 'redis';
import {
  ScriptedPlanner,
  StepEngine,
  registerHandler,
  type RunContext,
  type ToolCall,
  type ToolResult,
} from '@foundry/core';
import { checkpointStore } from './checkpoint-store.js';
import { db } from './db.js';
import * as github from './gateways/github.js';
import { logger } from './lib/logger.js';

export function registerGitHubHandlers(tenantId: string): void {
  registerHandler('github.list_prs', (args, signal) =>
    github.listPrs(tenantId, args as github.ListPrsArgs, signal),
  );
  registerHandler('github.get_pr', (args, signal) =>
    github.getPr(tenantId, args as github.GetPrArgs, signal),
  );
  registerHandler('github.add_comment', (args, signal) =>
    github.addComment(tenantId, args as github.AddCommentArgs, signal),
  );
  registerHandler('github.merge_pr', (args, signal) =>
    github.mergePr(tenantId, args as github.MergePrArgs, signal),
  );
}

async function writeAuditLog(
  runId: string,
  tenantId: string,
  result: ToolResult,
  args: unknown,
): Promise<void> {
  const inputHash = createHash('sha256').update(JSON.stringify(args)).digest('hex');
  const resultSummary = result.ok
    ? JSON.stringify(result.data).slice(0, 500)
    : (result.error?.slice(0, 500) ?? null);

  await db.query(
    `INSERT INTO tool_calls (run_id, tenant_id, tool_name, input_hash, result_summary, policy_decision, ok, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [runId, tenantId, result.toolName, inputHash, resultSummary, result.policyDecision, result.ok, result.durationMs],
  );
}

function parseOwnerRepo(input: string): { owner: string; repo: string } | null {
  const match = input.trim().match(/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function buildEmitter(redis: RedisClientType, runId: string) {
  return async function emit(type: string, data: Record<string, unknown>): Promise<void> {
    await redis.xAdd(`run:${runId}:events`, '*', {
      type,
      data: JSON.stringify({ runId, timestamp: new Date().toISOString(), ...data }),
    });
  };
}

function buildCallbacks(
  emit: ReturnType<typeof buildEmitter>,
  runId: string,
  tenantId: string,
  owner: string,
  repo: string,
  log: ReturnType<typeof logger.child>,
) {
  const pendingArgs = new Map<string, unknown>();

  return {
    pendingArgs,
    callbacks: {
      async onDecision(decision: import('@foundry/core').Decision) {
        if (decision.kind === 'call_tools') {
          for (const tool of decision.tools) {
            pendingArgs.set(tool.toolName, tool.args);
            log.info({ toolName: tool.toolName, args: tool.args }, 'calling tool');
            await emit('tool.requested', { toolName: tool.toolName, args: tool.args as Record<string, unknown> });
          }
        }
      },

      async onToolResult(result: ToolResult) {
        const args = pendingArgs.get(result.toolName);
        await writeAuditLog(runId, tenantId, result, args);
        pendingArgs.delete(result.toolName);

        log.info({ toolName: result.toolName, ok: result.ok, durationMs: result.durationMs }, 'tool result');

        if (result.toolName === 'github.list_prs' && result.ok) {
          const prs = result.data as Array<{ number: number }>;
          if (prs.length === 0) {
            await emit('token', { token: `No open pull requests found in ${owner}/${repo}.` });
          }
        }

        await emit('tool.result', {
          toolName: result.toolName,
          ok: result.ok,
          summary: result.ok ? `${result.toolName} succeeded` : result.error,
        });

        if (!result.ok) {
          log.error({ toolName: result.toolName, error: result.error }, 'tool failed');
        }
      },

      async onApprovalRequired(request: import('@foundry/core').ApprovalRequest, context: RunContext) {
        log.info({ approvalId: request.approvalId, toolName: request.tool.toolName }, 'approval required');

        // Write approval row
        const argsHash = createHash('sha256').update(JSON.stringify(request.tool.args)).digest('hex');
        await db.query(
          `INSERT INTO approvals (id, run_id, tenant_id, tool_name, args_hash)
           VALUES ($1, $2, $3, $4, $5)`,
          [request.approvalId, runId, tenantId, request.tool.toolName, argsHash],
        );

        // Store pending tool call in checkpoint so worker can resume
        await db.query(
          `UPDATE runs SET status = 'waiting_approval', checkpoint = $1, updated_at = now() WHERE id = $2`,
          [JSON.stringify({ ...context, pendingTool: request.tool, approvalId: request.approvalId }), runId],
        );

        await emit('approval.required', {
          approvalId: request.approvalId,
          toolName: request.tool.toolName,
          args: request.tool.args as Record<string, unknown>,
          riskLevel: request.riskLevel,
        });
      },

      async onFinalAnswer(answer: string) {
        if (answer) {
          log.info('emitting final answer');
          await emit('token', { token: answer });
        }
        await emit('run.completed', {});
      },

      async onLimitReached(reason: string) {
        log.warn({ reason }, 'run limit reached');
        await emit('run.failed', { reason });
      },
    },
  };
}

function buildPlanner(owner: string, repo: string) {
  const planner = new ScriptedPlanner([
    {
      decision: {
        kind: 'call_tools',
        tools: [{ toolName: 'github.list_prs', args: { owner, repo } }],
      },
    },
    {
      decision: { kind: 'call_tools', tools: [] },
      assert(step, lastResult) {
        const prs = lastResult as Array<{ number: number }>;
        if (!prs || prs.length === 0) {
          step.decision = { kind: 'final_answer', answer: `No open pull requests found in ${owner}/${repo}.` };
          return;
        }
        step.decision = {
          kind: 'call_tools',
          tools: [{ toolName: 'github.get_pr', args: { owner, repo, pull_number: prs[0].number } }],
        };
      },
    },
    // Step 2: show PR summary then ask to merge (triggers HITL)
    {
      decision: { kind: 'call_tools', tools: [] },
      assert(step, lastResult) {
        const pr = lastResult as { title: string; body: string; user: { login: string }; number: number };
        step.decision = {
          kind: 'call_tools',
          tools: [{ toolName: 'github.merge_pr', args: { owner, repo, pull_number: pr.number, merge_method: 'squash' } }],
        };
      },
    },
    // Step 3: final answer after merge
    {
      decision: { kind: 'final_answer', answer: 'Pull request merged successfully.' },
    },
  ]);
  return planner;
}

export async function runScriptedAgent(
  redis: RedisClientType,
  runId: string,
  tenantId: string,
  input: string,
  signal: AbortSignal,
): Promise<void> {
  const log = logger.child({ runId, tenantId });
  const emit = buildEmitter(redis, runId);

  await emit('run.started', {});
  log.info({ input }, 'scripted agent started');

  const parsed = parseOwnerRepo(input);
  if (!parsed) {
    log.warn({ input }, 'could not parse owner/repo from input');
    await emit('token', { token: `Could not find an "owner/repo" in the input. Try something like: suhailea/my-repo` });
    await emit('run.completed', {});
    return;
  }

  const { owner, repo } = parsed;
  const context: RunContext = { runId, tenantId, input, stepCount: 0, events: [] };
  const planner = buildPlanner(owner, repo);
  const engine = new StepEngine({ maxSteps: 20, timeoutMs: 60_000, signal }, checkpointStore);
  const { callbacks } = buildCallbacks(emit, runId, tenantId, owner, repo, log);

  await engine.run(planner, context, callbacks);
}

export async function resumeScriptedAgent(
  redis: RedisClientType,
  runId: string,
  tenantId: string,
  approvalId: string,
  approvalDecision: 'approved' | 'rejected',
  signal: AbortSignal,
): Promise<void> {
  const log = logger.child({ runId, tenantId, approvalId });
  const emit = buildEmitter(redis, runId);

  log.info({ approvalDecision }, 'resuming run after approval');

  // Load checkpoint with pending tool
  const result = await db.query(
    `SELECT checkpoint, input FROM runs WHERE id = $1 AND tenant_id = $2`,
    [runId, tenantId],
  );
  const row = result.rows[0];
  if (!row) {
    log.error('run not found during resume');
    return;
  }

  const checkpoint = row.checkpoint as RunContext & { pendingTool?: ToolCall; approvalId?: string };

  if (approvalDecision === 'rejected') {
    await emit('run.failed', { reason: 'Rejected by human' });
    return;
  }

  if (!checkpoint.pendingTool) {
    log.error('no pending tool found in checkpoint');
    await emit('run.failed', { reason: 'Internal error: no pending tool in checkpoint' });
    return;
  }

  const parsed = parseOwnerRepo(checkpoint.input);
  if (!parsed) {
    await emit('run.failed', { reason: 'Could not parse repo from input' });
    return;
  }

  const { owner, repo } = parsed;
  const planner = buildPlanner(owner, repo);
  const engine = new StepEngine({ maxSteps: 20, timeoutMs: 60_000, signal }, checkpointStore);
  const { callbacks } = buildCallbacks(emit, runId, tenantId, owner, repo, log);

  await engine.run(planner, checkpoint, callbacks, {
    tool: checkpoint.pendingTool,
    approvalId,
  });
}
