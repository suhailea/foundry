-- Migration 0005: add foreign key from runs.tenant_id to tenants.id
-- First insert the stub tenant so existing rows satisfy the FK
INSERT INTO tenants (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'stub')
ON CONFLICT DO NOTHING;

ALTER TABLE runs
  ADD CONSTRAINT runs_tenant_id_fk
  FOREIGN KEY (tenant_id) REFERENCES tenants(id);
