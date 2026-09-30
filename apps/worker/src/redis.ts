import { createClient } from 'redis';

const url = process.env['REDIS_URL'];
if (!url) throw new Error('REDIS_URL is required');

export const redis = createClient({ url });

await redis.connect();
