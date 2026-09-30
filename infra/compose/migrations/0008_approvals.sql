-- Approval requests created when the policy gate returns 'hitl'.
-- args_hash is SHA-256 of the tool args — never store raw args (may contain sensitive values).
-- decision_by is the user who approved or rejected.

CREATE TABLE approvals (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID        NOT NULL REFERENCES runs(id),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id),
  tool_name    TEXT        NOT NULL,
  args_hash    TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected')),
  decision_by  UUID        REFERENCES users(id),
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);

CREATE INDEX approvals_run_id_idx    ON approvals(run_id);
CREATE INDEX approvals_tenant_id_idx ON approvals(tenant_id);
