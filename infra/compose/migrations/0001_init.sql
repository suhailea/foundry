-- Migration 0001: initial schema
-- Creates the runs table for Phase A0.
-- Never edit this file once applied; add a new migration instead.

CREATE TABLE IF NOT EXISTS runs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued','running','waiting_approval','completed','failed','cancelled')),
  input       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for the queries we actually run: fetch a run by tenant + id
CREATE INDEX IF NOT EXISTS runs_tenant_id_idx ON runs (tenant_id);
