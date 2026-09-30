import { useMutation } from '@tanstack/react-query';
import { authHeaders } from '../lib/auth.js';

async function resolveApproval(approvalId: string, decision: 'approve' | 'reject', reason?: string) {
  const res = await fetch(`/v1/approvals/${approvalId}/${decision}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error('Failed to resolve approval');
}

export function useApproval() {
  const approve = useMutation({
    mutationFn: (approvalId: string) => resolveApproval(approvalId, 'approve'),
  });

  const reject = useMutation({
    mutationFn: ({ approvalId, reason }: { approvalId: string; reason?: string }) =>
      resolveApproval(approvalId, 'reject', reason),
  });

  return { approve, reject };
}
