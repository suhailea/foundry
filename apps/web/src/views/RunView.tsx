import { useState } from 'react';
import { RunInput } from '../components/run/RunInput.js';
import { RunOutput } from '../components/run/RunOutput.js';
import { createRun } from '../lib/api.js';
import { useRunStream } from '../hooks/use-run-stream.js';

export function RunView() {
  const [runId, setRunId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const stream = useRunStream(runId);

  const isActive = stream.phase === 'connecting' || stream.phase === 'streaming';

  const handleSubmit = async (input: string) => {
    setSubmitting(true);
    setRunId(null);
    try {
      const { runId: id } = await createRun(input);
      setRunId(id);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-14 items-center border-b border-gray-100 px-6">
        <h1 className="text-sm font-semibold text-gray-900">New Run</h1>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
        <RunInput onSubmit={handleSubmit} disabled={submitting || isActive} />
        {stream.phase !== 'idle' && (
          <RunOutput
            phase={stream.phase}
            output={stream.output}
            errorReason={stream.errorReason}
            approvals={stream.approvals}
          />
        )}
      </div>
    </div>
  );
}
