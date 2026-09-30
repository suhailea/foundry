import { Hono } from 'hono';
import { auth } from './routes/auth.js';
import { approvals } from './routes/approvals.js';
import { integrations } from './routes/integrations.js';
import { runs } from './routes/runs.js';
import { requireAuth } from './middleware/auth.js';

export const app = new Hono();

app.onError((err, c) => {
  console.error('[api error]', err);
  return c.json({ error: err.message }, 500);
});

app.get('/health', (c) => c.json({ status: 'ok' }));
app.route('/v1/auth', auth);
// SSE events route uses ?token= query param (EventSource can't send headers) — excluded from middleware
app.use('/v1/runs/*', async (c, next) => {
  if (c.req.path.endsWith('/events')) return next();
  return requireAuth(c, next);
});
app.use('/v1/runs', requireAuth);
app.route('/v1/runs', runs);
app.use('/v1/approvals/*', requireAuth);
app.route('/v1/approvals', approvals);
app.route('/v1/integrations', integrations);
