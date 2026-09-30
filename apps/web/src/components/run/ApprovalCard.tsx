import { ShieldAlert } from 'lucide-react';
import { Button } from '../ui/button.js';
import { useApproval } from '../../hooks/use-approval.js';

interface ApprovalCardProps {
  approvalId: string;
  toolName: string;
  args: Record<string, unknown>;
  riskLevel: 'write' | 'high';
  resolved?: boolean;
  resolution?: 'approved' | 'rejected';
}

export function ApprovalCard({ approvalId, toolName, args, riskLevel, resolved, resolution }: ApprovalCardProps) {
  const { approve, reject } = useApproval();
  const isPending = approve.isPending || reject.isPending;

  return (
    <div className={`rounded-lg border p-4 ${
      resolved
        ? resolution === 'approved'
          ? 'border-green-200 bg-green-50'
          : 'border-red-200 bg-red-50'
        : 'border-amber-200 bg-amber-50'
    }`}>
      <div className="flex items-start gap-3">
        <ShieldAlert className={`mt-0.5 h-4 w-4 shrink-0 ${
          resolved
            ? resolution === 'approved' ? 'text-green-600' : 'text-red-600'
            : 'text-amber-600'
        }`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {resolved
              ? resolution === 'approved' ? 'Approved' : 'Rejected'
              : 'Approval required'}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            Tool: <span className="font-mono">{toolName}</span>
            <span className={`ml-2 inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium ${
              riskLevel === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {riskLevel.toUpperCase()}
            </span>
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-white/60 p-2 text-xs text-gray-700">
            {JSON.stringify(args, null, 2)}
          </pre>

          {!resolved && (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={() => approve.mutate(approvalId)}
                disabled={isPending}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => reject.mutate({ approvalId, reason: 'Rejected by user' })}
                disabled={isPending}
              >
                Reject
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
