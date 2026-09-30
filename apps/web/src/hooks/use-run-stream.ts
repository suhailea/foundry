import { useEffect, useRef, useState } from 'react';
import { connectRunStream } from '../lib/sse.js';

type Phase = 'idle' | 'connecting' | 'streaming' | 'completed' | 'failed';

export interface PendingApproval {
  approvalId: string;
  toolName: string;
  args: Record<string, unknown>;
  riskLevel: 'write' | 'high';
  resolved: boolean;
  resolution?: 'approved' | 'rejected';
}

interface RunStreamState {
  phase: Phase;
  output: string;
  errorReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  approvals: PendingApproval[];
}

export function useRunStream(runId: string | null): RunStreamState {
  const [state, setState] = useState<RunStreamState>({
    phase: 'idle',
    output: '',
    errorReason: null,
    startedAt: null,
    completedAt: null,
    approvals: [],
  });

  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!runId) return;

    setState({ phase: 'connecting', output: '', errorReason: null, startedAt: null, completedAt: null, approvals: [] });

    const cleanup = connectRunStream(runId, {
      onEvent(event) {
        if (event.type === 'run.started') {
          setState((s) => ({ ...s, phase: 'streaming', startedAt: event.timestamp }));
        } else if (event.type === 'token') {
          setState((s) => ({ ...s, output: s.output + event.token }));
        } else if (event.type === 'run.completed') {
          setState((s) => ({ ...s, phase: 'completed', completedAt: event.timestamp }));
        } else if (event.type === 'run.failed') {
          setState((s) => ({ ...s, phase: 'failed', errorReason: event.reason }));
        } else if (event.type === 'approval.required') {
          setState((s) => ({
            ...s,
            approvals: [
              ...s.approvals,
              {
                approvalId: event.approvalId,
                toolName: event.toolName,
                args: event.args,
                riskLevel: event.riskLevel,
                resolved: false,
              },
            ],
          }));
        } else if (event.type === 'approval.resolved') {
          setState((s) => ({
            ...s,
            approvals: s.approvals.map((a) =>
              a.approvalId === event.approvalId
                ? { ...a, resolved: true, resolution: event.decision }
                : a,
            ),
          }));
        }
      },
      onError() {
        setState((s) =>
          s.phase === 'completed' || s.phase === 'failed'
            ? s
            : { ...s, phase: 'failed', errorReason: 'Connection lost' },
        );
      },
    });

    cleanupRef.current = cleanup;
    return () => {
      cleanup();
      cleanupRef.current = null;
    };
  }, [runId]);

  return state;
}
