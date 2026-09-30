import { StreamEventSchema, type StreamEvent } from '@foundry/shared';
import { getToken } from './auth.js';

interface StreamHandlers {
  onEvent: (event: StreamEvent) => void;
  onError: (err: Event) => void;
}

export function connectRunStream(
  runId: string,
  handlers: StreamHandlers,
): () => void {
  const token = getToken();
  const url = token
    ? `/v1/runs/${runId}/events?token=${encodeURIComponent(token)}`
    : `/v1/runs/${runId}/events`;
  const es = new EventSource(url);

  es.onmessage = (msg) => {
    const parsed = StreamEventSchema.safeParse(JSON.parse(msg.data as string));
    if (parsed.success) {
      handlers.onEvent(parsed.data);
    }
  };

  es.onerror = (err) => {
    handlers.onError(err);
    es.close();
  };

  return () => es.close();
}
