import type { StreamEvent } from '@foundry/shared';
import type { RedisClientType } from 'redis';

// The echo agent: A0's stub "orchestrator".
// It emits run.started, a few token events, then run.completed to the Redis Stream.
// The stream key per run is `stream:run:<runId>`.

export async function runEchoAgent(
  redis: RedisClientType,
  runId: string,
  input: string,
): Promise<void> {
  const streamKey = `stream:run:${runId}`;

  const emit = async (event: StreamEvent) => {
    await redis.xAdd(streamKey, '*', { data: JSON.stringify(event) });
  };

  await emit({ type: 'run.started', runId, timestamp: new Date().toISOString() });

  // Echo the input back token by token (split by word)
  const tokens = `Echo: ${input}`.split(' ');
  for (const token of tokens) {
    await emit({ type: 'token', runId, token: `${token} `, timestamp: new Date().toISOString() });
  }

  await emit({ type: 'run.completed', runId, timestamp: new Date().toISOString() });

  // Expire the stream after 1 hour — runs are read from Postgres for history
  await redis.expire(streamKey, 3600);
}
