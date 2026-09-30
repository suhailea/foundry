import { zValidator } from '@hono/zod-validator';
import bcrypt from 'bcryptjs';
import { Hono } from 'hono';
import { z } from 'zod';
import { signSession } from '../lib/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import { db } from '../db.js';

export const auth = new Hono();

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// POST /v1/auth/register
auth.post('/register', zValidator('json', RegisterSchema), async (c) => {
  const { email, password, name } = c.req.valid('json');

  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if ((existing.rowCount ?? 0) > 0) {
    return c.json({ error: 'Email already registered' }, 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Create tenant + user in a transaction
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const tenantResult = await client.query<{ id: string }>(
      `INSERT INTO tenants (name) VALUES ($1) RETURNING id`,
      [name ?? email],
    );
    const tenantId = tenantResult.rows[0]!.id;

    const userResult = await client.query<{ id: string }>(
      `INSERT INTO users (tenant_id, email, password_hash) VALUES ($1, $2, $3) RETURNING id`,
      [tenantId, email, passwordHash],
    );
    const userId = userResult.rows[0]!.id;
    await client.query('COMMIT');

    const token = await signSession({ userId, tenantId, email });
    return c.json({ token, userId, tenantId }, 201);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /v1/auth/login
auth.post('/login', zValidator('json', LoginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const result = await db.query<{ id: string; tenant_id: string; password_hash: string }>(
    `SELECT id, tenant_id, password_hash FROM users WHERE email = $1`,
    [email],
  );

  const user = result.rows[0];
  // Always run bcrypt compare to avoid timing attacks
  const hash = user?.password_hash ?? '$2a$12$invalidhashfortimingnullcheck000000000000000000000000';
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const token = await signSession({ userId: user.id, tenantId: user.tenant_id, email });
  return c.json({ token, userId: user.id, tenantId: user.tenant_id });
});

// POST /v1/auth/logout — client just drops the token; this is a no-op for JWT
auth.post('/logout', requireAuth, (c) => c.json({ ok: true }));

// GET /v1/auth/me
auth.get('/me', requireAuth, async (c) => {
  const userId = c.get('userId') as string;
  const result = await db.query<{ id: string; email: string; tenant_id: string; created_at: string }>(
    `SELECT id, email, tenant_id, created_at FROM users WHERE id = $1`,
    [userId],
  );
  const user = result.rows[0];
  if (!user) return c.json({ error: 'Not found' }, 404);
  return c.json({ id: user.id, email: user.email, tenantId: user.tenant_id, createdAt: user.created_at });
});
