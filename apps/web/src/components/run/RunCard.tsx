import type { Run } from '@foundry/shared';
import { Link } from '@tanstack/react-router';
import { formatDistanceToNow } from '../shared/format-date.js';
import { RunStatusBadge } from './RunStatusBadge.js';

interface RunCardProps {
  run: Run;
}

export function RunCard({ run }: RunCardProps) {
  const preview = run.input.length > 80 ? `${run.input.slice(0, 80)}…` : run.input;

  return (
    <Link
      to="/runs/$runId"
      params={{ runId: run.id }}
      className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-white p-4 transition-colors hover:border-gray-200 hover:bg-gray-50"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-900 leading-snug">{preview}</p>
        <RunStatusBadge status={run.status} className="shrink-0" />
      </div>
      <p className="text-xs text-gray-400">
        {formatDistanceToNow(run.createdAt)}
      </p>
    </Link>
  );
}
