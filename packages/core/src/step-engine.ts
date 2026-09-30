import type { CheckpointStore } from './checkpoint.js';
import type { Decision, Planner, RunContext, ToolCall } from './planner.js';
import type { ToolResult } from './tool-executor.js';
import { executeTool } from './tool-executor.js';

export interface StepEngineConfig {
  maxSteps: number;
  timeoutMs: number;
  signal: AbortSignal;
}

export interface ApprovalRequest {
  approvalId: string;
  tool: ToolCall;
  riskLevel: 'write' | 'high';
}

export interface StepEngineCallbacks {
  onDecision(decision: Decision): Promise<void>;
  onToolResult(result: ToolResult): Promise<void>;
  onApprovalRequired(request: ApprovalRequest, context: RunContext): Promise<void>;
  onFinalAnswer(answer: string): Promise<void>;
  onLimitReached(reason: string): Promise<void>;
}

export class StepEngine {
  constructor(
    private config: StepEngineConfig,
    private checkpoints: CheckpointStore,
  ) {}

  async run(
    planner: Planner,
    context: RunContext,
    callbacks: StepEngineCallbacks,
    // When resuming after approval, execute this tool call first then continue
    resumeWith?: { tool: ToolCall; approvalId: string },
  ): Promise<void> {
    const deadline = Date.now() + this.config.timeoutMs;

    // --- Resume path: re-execute the approved tool call ---
    if (resumeWith) {
      const result = await executeTool(
        resumeWith.tool.toolName,
        resumeWith.tool.args,
        { tenantId: context.tenantId, runId: context.runId },
        this.config.signal,
      );
      await callbacks.onToolResult(result);
      context = {
        ...context,
        stepCount: context.stepCount + 1,
        lastToolResult: result.data,
      };
      await this.checkpoints.save(context.runId, context);
    }

    while (true) {
      // --- Hard limits ---

      if (this.config.signal.aborted) {
        await callbacks.onLimitReached('cancelled');
        return;
      }

      if (context.stepCount >= this.config.maxSteps) {
        await callbacks.onLimitReached('step limit reached');
        return;
      }

      if (Date.now() >= deadline) {
        await callbacks.onLimitReached('timeout');
        return;
      }

      // --- Ask the planner ---

      const decision = await planner.decide(context);
      await callbacks.onDecision(decision);

      // --- Execute ---

      if (decision.kind === 'final_answer') {
        await callbacks.onFinalAnswer(decision.answer);
        return;
      }

      if (decision.kind === 'ask_human') {
        await callbacks.onLimitReached('human approval required (not yet implemented)');
        return;
      }

      if (decision.kind === 'delegate') {
        await callbacks.onLimitReached('delegation not yet implemented');
        return;
      }

      if (decision.kind === 'call_tools') {
        let lastResult: ToolResult | undefined;

        for (const tool of decision.tools) {
          if (this.config.signal.aborted) {
            await callbacks.onLimitReached('cancelled');
            return;
          }

          const result = await executeTool(
            tool.toolName,
            tool.args,
            { tenantId: context.tenantId, runId: context.runId },
            this.config.signal,
          );

          await callbacks.onToolResult(result);
          lastResult = result;

          if (result.policyDecision === 'hitl') {
            // Checkpoint current context before pausing so we can resume
            await this.checkpoints.save(context.runId, context);
            await callbacks.onApprovalRequired(
              {
                approvalId: crypto.randomUUID(),
                tool,
                riskLevel: 'high',
              },
              context,
            );
            return; // Worker exits — no thread held
          }
        }

        context = {
          ...context,
          stepCount: context.stepCount + 1,
          lastToolResult: lastResult?.data,
        };

        await this.checkpoints.save(context.runId, context);
      }
    }
  }
}
