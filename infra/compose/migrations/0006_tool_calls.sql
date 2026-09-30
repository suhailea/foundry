-- Tool call audit log
-- Every tool execution is recorded here regardless of outcome.
-- input_hash is SHA-256 of serialised args — never raw args (may contain sensitive values).
-- result_summary is capped at 500 chars with secrets redacted.

CREATE TABLE tool_calls (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           UUID        NOT NULL REFERENCES runs(id),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id),
  tool_name        TEXT        NOT NULL,
  input_hash       TEXT        NOT NULL,
  result_summary   TEXT,
  policy_decision  TEXT        NOT NULL CHECK (policy_decision IN ('allow', 'hitl', 'block')),
  ok               BOOLEAN     NOT NULL,
  duration_ms      INTEGER     NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tool_calls_run_id_idx    ON tool_calls(run_id);
CREATE INDEX tool_calls_tenant_id_idx ON tool_calls(tenant_id);
