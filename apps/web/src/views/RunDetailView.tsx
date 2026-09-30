import { useParams } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { RunOutput } from '../components/run/RunOutput.js';
import { RunStatusBadge } from '../components/run/RunStatusBadge.js';
import { LoadingSpinner } from '../components/shared/LoadingSpinner.js';
import { Button } from '../components/ui/button.js';
import { useRun } from '../hooks/use-run.js';
import { useRunStream } from '../hooks/use-run-stream.js';
import { Link } from '@tanstack/react-router';

export function RunDetailView() {
  const { runId } = useParams({ from: '/runs/$runId' });
  const { data: run, isLoading } = useRun(runId);
  const stream = useRunStream(runId);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-14 items-center gap-3 border-b border-gray-100 px-6">
        <Link to="/runs">
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex flex-1 items-center gap-3 min-w-0">
          {isLoading ? (
            <LoadingSpinner className="h-4 w-4" />
          ) : run ? (
            <>
              <p className="text-sm font-medium text-gray-900 truncate">
                {run.input.length > 60 ? `${run.input.slice(0, 60)}…` : run.input}
              </p>
              <RunStatusBadge status={run.status} />
            </>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <RunOutput
          phase={stream.phase === 'idle' ? 'connecting' : stream.phase}
          output={stream.output}
          errorReason={stream.errorReason}
        />
      </div>
    </div>
  );
}
