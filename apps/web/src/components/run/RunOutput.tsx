import { useEffect, useRef } from 'react';
import type { PendingApproval } from '../../hooks/use-run-stream.js';
import { ScrollArea } from '../ui/scroll-area.js';
import { ApprovalCard } from './ApprovalCard.js';
import { RunErrorBanner } from './RunErrorBanner.js';

type Phase = 'idle' | 'connecting' | 'streaming' | 'completed' | 'failed';

interface RunOutputProps {
  phase: Phase;
  output: string;
  errorReason: string | null;
  approvals: PendingApproval[];
}

export function RunOutput({ phase, output, errorReason, approvals }: RunOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output, approvals]);

  if (phase === 'idle') return null;

  return (
    <div className="flex flex-col gap-3">
      <ScrollArea className="h-full max-h-[60vh] rounded-lg border border-gray-100 bg-gray-50">
        <div className="flex flex-col gap-3 p-4">
          <pre className="font-mono text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
            {phase === 'connecting' && !output && (
              <span className="text-gray-400">Connecting...</span>
            )}
            {output}
            {phase === 'streaming' && approvals.every((a) => a.resolved) && (
              <span className="inline-block h-4 w-2 bg-gray-400 align-middle animate-pulse ml-0.5" />
            )}
          </pre>

          {approvals.map((approval) => (
            <ApprovalCard
              key={approval.approvalId}
              approvalId={approval.approvalId}
              toolName={approval.toolName}
              args={approval.args}
              riskLevel={approval.riskLevel}
              resolved={approval.resolved}
              resolution={approval.resolution}
            />
          ))}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      {phase === 'failed' && errorReason && <RunErrorBanner reason={errorReason} />}
    </div>
  );
}
