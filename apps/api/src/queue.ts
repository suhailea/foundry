import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const url = process.env['REDIS_URL'];
if (!url) throw new Error('REDIS_URL is required');

export const redisConnection = new IORedis(url, { maxRetriesPerRequest: null });

export const runsQueue = new Queue('runs', { connection: redisConnection });
