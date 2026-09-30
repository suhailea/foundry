-- Checkpoint storage for the orchestrator step engine.
-- checkpoint: full RunContext serialised as JSONB — enables any worker to resume any run.
-- step_count: denormalised for fast limit checks without deserialising the checkpoint.

ALTER TABLE runs ADD COLUMN checkpoint  JSONB;
ALTER TABLE runs ADD COLUMN step_count  INTEGER NOT NULL DEFAULT 0;
