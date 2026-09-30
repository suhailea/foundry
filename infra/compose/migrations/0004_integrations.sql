-- Migration 0004: integrations table (OAuth tokens, encrypted at rest)
CREATE TABLE IF NOT EXISTS integrations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id),
  user_id         UUID        NOT NULL REFERENCES users(id),
  provider        TEXT        NOT NULL CHECK (provider IN ('github', 'jira', 'slack')),
  encrypted_token TEXT        NOT NULL,
  token_iv        TEXT        NOT NULL,
  token_tag       TEXT        NOT NULL,
  refresh_token   TEXT,
  expires_at      TIMESTAMPTZ,
  scope           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS integrations_tenant_id_idx ON integrations(tenant_id);
