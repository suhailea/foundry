import { Hono } from 'hono';
import { db } from '../db.js';
import { encrypt } from '../lib/crypto.js';
import { verifySession } from '../lib/jwt.js';
import { buildAuthUrl, exchangeCode, generateState, type OAuthProvider } from '../lib/oauth.js';
import { requireAuth } from '../middleware/auth.js';

export const integrations = new Hono();

const PROVIDERS: OAuthProvider[] = ['github'];

// GET /v1/integrations — list connected integrations (no tokens)
integrations.get('/', requireAuth, async (c) => {
  const tenantId = c.get('tenantId') as string;
  const result = await db.query(
    `SELECT provider, scope, created_at FROM integrations WHERE tenant_id = $1`,
    [tenantId],
  );
  return c.json(result.rows.map((r) => ({
    provider: r.provider,
    scope: r.scope,
    connectedAt: r.created_at,
  })));
});

// GET /v1/integrations/:provider/connect?token=<jwt>
// Browser navigates here directly so JWT comes as query param, not header
integrations.get('/:provider/connect', async (c) => {
  const provider = c.req.param('provider') as OAuthProvider;
  if (!PROVIDERS.includes(provider)) {
    return c.json({ error: 'Unknown provider' }, 400);
  }

  // Verify token from query param
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  try {
    await verifySession(token);
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const state = generateState();
  const authUrl = buildAuthUrl(provider, state);

  return new Response(null, {
    status: 302,
    headers: new Headers([
      ['Location', authUrl],
      ['Set-Cookie', `oauth_state=${state}; HttpOnly; SameSite=Lax; Max-Age=600; Path=/`],
      ['Set-Cookie', `oauth_session=${token}; HttpOnly; SameSite=Lax; Max-Age=600; Path=/`],
    ]),
  });
});

// GET /v1/integrations/:provider/callback — exchange code, store encrypted token
// Token is stored in oauth_state cookie alongside the state; we read it back here
integrations.get('/:provider/callback', async (c) => {
  const provider = c.req.param('provider') as OAuthProvider;
  const { code, state } = c.req.query();

  // Parse cookies
  const cookies = Object.fromEntries(
    (c.req.header('Cookie') ?? '').split(';').map((s) => {
      const [k, ...v] = s.trim().split('=');
      return [k?.trim(), v.join('=')];
    }),
  );

  // Verify CSRF state
  if (!state || !cookies['oauth_state'] || state !== cookies['oauth_state']) {
    return c.json({ error: 'Invalid OAuth state' }, 400);
  }

  // Recover session from cookie set during connect
  const sessionToken = cookies['oauth_session'];
  if (!sessionToken) return c.json({ error: 'Unauthorized' }, 401);

  let session: { userId: string; tenantId: string };
  try {
    session = await verifySession(sessionToken);
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (!code) return c.json({ error: 'Missing OAuth code' }, 400);

  const { accessToken, scope } = await exchangeCode(provider, code);
  const encrypted = encrypt(accessToken);

  await db.query(
    `INSERT INTO integrations (tenant_id, user_id, provider, encrypted_token, token_iv, token_tag, scope)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tenant_id, provider)
     DO UPDATE SET encrypted_token = $4, token_iv = $5, token_tag = $6, scope = $7, updated_at = now()`,
    [session.tenantId, session.userId, provider, encrypted.ciphertext, encrypted.iv, encrypted.tag, scope],
  );

  return new Response(null, {
    status: 302,
    headers: new Headers([
      ['Location', `${process.env['APP_URL'] ?? 'http://localhost:5174'}/integrations`],
      ['Set-Cookie', 'oauth_state=; HttpOnly; Max-Age=0; Path=/'],
      ['Set-Cookie', 'oauth_session=; HttpOnly; Max-Age=0; Path=/'],
    ]),
  });
});

// DELETE /v1/integrations/:provider — disconnect
integrations.delete('/:provider', requireAuth, async (c) => {
  const provider = c.req.param('provider');
  const tenantId = c.get('tenantId') as string;
  await db.query(
    `DELETE FROM integrations WHERE tenant_id = $1 AND provider = $2`,
    [tenantId, provider],
  );
  return c.json({ ok: true });
});
