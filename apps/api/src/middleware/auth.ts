import type { Context, Next } from 'hono';
import { verifySession } from '../lib/jwt.js';

export async function requireAuth(c: Context, next: Next) {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = header.slice(7);
  try {
    const session = await verifySession(token);
    c.set('userId', session.userId);
    c.set('tenantId', session.tenantId);
    c.set('email', session.email);
    await next();
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
}
