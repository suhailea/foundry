import { History } from 'lucide-react';
import { RunCard } from '../components/run/RunCard.js';
import { EmptyState } from '../components/shared/EmptyState.js';
import { LoadingSpinner } from '../components/shared/LoadingSpinner.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { useRuns } from '../hooks/use-runs.js';

export function RunHistoryView() {
  const { data: runs, isLoading, isError } = useRuns();

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-14 items-center border-b border-gray-100 px-6">
        <h1 className="text-sm font-semibold text-gray-900">Run History</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState
            icon={History}
            title="Could not load runs"
            description="Make sure the API is running and try again."
          />
        )}

        {!isLoading && !isError && runs?.length === 0 && (
          <EmptyState
            icon={History}
            title="No runs yet"
            description="Submit a prompt from New Run to get started."
          />
        )}

        {!isLoading && !isError && runs && runs.length > 0 && (
          <div className="flex flex-col gap-3">
            {runs.map((run) => (
              <RunCard key={run.id} run={run} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
