import { createClient } from 'redis';

const url = process.env['REDIS_URL'];
if (!url) throw new Error('REDIS_URL is required');

export const streamRedis = createClient({ url });

await streamRedis.connect();
