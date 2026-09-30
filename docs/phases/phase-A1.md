# Phase A1 — Integrations: Auth, OAuth, Token Storage

**Status:** Planned
**Depends on:** A0 complete ✅

---

## What this phase teaches

- How to build a real auth layer (sessions, identity, tenant isolation) from scratch
- How OAuth 2.0 flows work end-to-end (authorization code + PKCE)
- How to store secrets safely (encrypted at rest, never in logs or LLM context)
- How tenant isolation moves from a hardcoded stub to a real enforced boundary

---

## Scope

### 1. Users & Sessions

- `POST /v1/auth/register` — email + password, bcrypt hash, create user + tenant
- `POST /v1/auth/login` — verify password, issue signed session token (JWT, short-lived)
- `POST /v1/auth/logout` — invalidate session
- `GET /v1/auth/me` — return current user from session
- Auth middleware — verifies session on every protected route, attaches `user` + `tenant_id` to context
- Replace hardcoded `tenantId` stub everywhere with real identity from session

### 2. Database migrations

- `0002_users.sql` — `users` table: `id`, `tenant_id`, `email`, `password_hash`, `created_at`
- `0003_tenants.sql` — `tenants` table: `id`, `name`, `created_at`
- `0004_integrations.sql` — `integrations` table: `id`, `tenant_id`, `user_id`, `provider`, `encrypted_token`, `refresh_token`, `expires_at`, `created_at`

### 3. OAuth flows (GitHub first, then Jira, then Slack)

- `GET /v1/integrations/:provider/connect` — redirect to provider OAuth URL with state param (CSRF protection)
- `GET /v1/integrations/:provider/callback` — exchange code for token, encrypt, store in `integrations` table
- `DELETE /v1/integrations/:provider` — disconnect (delete token)
- `GET /v1/integrations` — list connected integrations for the tenant (provider name + connected_at, never the token)

### 4. Secrets vault

- Tokens encrypted at rest using AES-256-GCM
- Encryption key from env var (`ENCRYPTION_KEY`), never hardcoded
- `encrypt(plaintext): { iv, ciphertext, tag }` and `decrypt({ iv, ciphertext, tag }): plaintext`
- Only the gateway layer decrypts tokens at call time — no other layer touches plaintext tokens

### 5. UI pages

- `/login` — email + password form, redirects to `/` on success
- `/register` — sign up form
- `/integrations` — list connected providers with connect/disconnect buttons; replaces the "Coming in A1" stub
- `/settings` — user profile (email, change password placeholder)
- Protect all routes except `/login` and `/register` — redirect to `/login` if no session

---

## Out of scope for A1

- Social login (GitHub login as auth — that's different from GitHub as an integration)
- MFA / 2FA
- Team management / multiple users per tenant
- Token refresh (implement in A2 when tools actually use the tokens)
- Jira and Slack OAuth (GitHub is the target; Jira + Slack are stretch goals)

---

## Stack additions

| Addition | Justification |
|---|---|
| `bcryptjs` | Password hashing |
| `jose` | JWT signing/verification (Web Standards, works with Hono) |
| Node `crypto` | AES-256-GCM encryption — built-in, no new dep needed |

No new UI libraries needed — the existing shadcn components cover the auth forms.

---

## Database schema

```sql
-- 0002_tenants.sql
CREATE TABLE tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 0003_users.sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX users_tenant_id_idx ON users(tenant_id);

-- 0004_integrations.sql
CREATE TABLE integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  provider        TEXT NOT NULL CHECK (provider IN ('github', 'jira', 'slack')),
  encrypted_token TEXT NOT NULL,
  token_iv        TEXT NOT NULL,
  token_tag       TEXT NOT NULL,
  refresh_token   TEXT,
  expires_at      TIMESTAMPTZ,
  scope           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, provider)
);
CREATE INDEX integrations_tenant_id_idx ON integrations(tenant_id);
```

---

## API layout

```
apps/api/src/
├── middleware/
│   └── auth.ts           — session verification middleware
├── routes/
│   ├── auth.ts           — register, login, logout, me
│   └── integrations.ts   — connect, callback, disconnect, list
├── lib/
│   ├── crypto.ts         — encrypt / decrypt (AES-256-GCM)
│   ├── jwt.ts            — sign / verify session JWT
│   └── oauth.ts          — build OAuth URLs, exchange code for token
```

---

## UI layout additions

```
apps/web/src/
├── views/
│   ├── LoginView.tsx
│   ├── RegisterView.tsx
│   └── IntegrationsView.tsx   — replace stub with real connect/disconnect UI
├── hooks/
│   ├── use-auth.ts            — current user from GET /v1/auth/me
│   └── use-integrations.ts    — list integrations
├── components/
│   └── auth/
│       ├── AuthGuard.tsx      — redirects to /login if no session
│       └── UserMenu.tsx       — sidebar bottom: user email + logout button
```

---

## Security invariants (from CLAUDE.md §13)

1. Passwords never logged — pino redaction config covers `password`, `password_hash`, `token`, `authorization`
2. JWT signed with a secret from env (`JWT_SECRET`), verified on every request
3. Session tokens short-lived (1 hour), no refresh tokens for sessions
4. OAuth tokens encrypted before insert, decrypted only in the gateway (A2+)
5. OAuth `state` param verified on callback to prevent CSRF
6. Cross-tenant: every query filters by `tenant_id` from the session, never from the request body
7. `GET /v1/integrations` returns provider name + connected_at only — never the token

---

## Done when

- [ ] `POST /v1/auth/register` creates a user + tenant, returns a session token
- [ ] `POST /v1/auth/login` returns a session token for valid credentials
- [ ] Auth middleware blocks unauthenticated requests with `401`
- [ ] `POST /v1/runs` uses the real `tenant_id` from the session
- [ ] `GET /v1/integrations/github/connect` redirects to GitHub OAuth
- [ ] GitHub callback stores an encrypted token in the `integrations` table
- [ ] `GET /v1/integrations` returns the connected provider list (no tokens)
- [ ] UI `/login` and `/register` work end-to-end
- [ ] UI `/integrations` shows connect/disconnect for GitHub
- [ ] All routes except `/login` and `/register` redirect to `/login` if unauthenticated
- [ ] `pnpm test` passes including auth and integration tests
- [ ] No tokens appear in logs, traces, or API responses

---

## Drills (run before hardening)

1. **No session → 401:** Call `POST /v1/runs` with no `Authorization` header — expect `401`, not `500` or `200`
2. **Wrong tenant:** Create two users in different tenants, try to fetch one tenant's run from the other — expect `404`
3. **Bad password:** `POST /v1/auth/login` with wrong password — expect `401` with no timing difference (constant-time compare)
4. **OAuth CSRF:** Call the callback endpoint with a `state` param that doesn't match the session — expect `400`
5. **Token in logs:** Submit a run after connecting GitHub, grep the logs for the token string — expect zero matches
6. **Expired JWT:** Manually set a JWT with `exp` in the past — expect `401`

---

## Open decisions

- Session storage: **JWT in `Authorization` header** (stateless) vs **opaque token in Postgres** (revocable). Recommendation: JWT for A1 (simpler), move to opaque tokens if revocation becomes a requirement.
- GitHub OAuth app: Suhail registers the app at github.com/settings/developers and puts `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` in `.env`.

---

## Env vars added in A1

```
JWT_SECRET=<random 64-char hex>
ENCRYPTION_KEY=<random 32-byte hex>
GITHUB_CLIENT_ID=<from GitHub OAuth app>
GITHUB_CLIENT_SECRET=<from GitHub OAuth app>
GITHUB_REDIRECT_URI=http://localhost:3001/v1/integrations/github/callback
```
