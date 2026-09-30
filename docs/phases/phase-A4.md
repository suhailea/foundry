# Phase A4 — HITL (Human-in-the-Loop)

**Status:** Planned
**Depends on:** A3 complete ✅

---

## What this phase teaches

- How to pause a running agent and wait for human input without blocking a worker thread
- How the run state machine's `waiting_approval` state works in practice
- How to resume a paused run from the queue with the human's decision attached
- How the UI presents an approval request and sends the decision back
- How the policy gate's `hitl` decision integrates with the step engine

---

## The core idea

When the policy gate returns `hitl` for a tool call (e.g. `github.merge_pr`), the run must:

1. Emit an `approval.required` event — UI shows an approval card
2. Transition the run to `waiting_approval` in the DB
3. Release the worker — no thread is held
4. Wait for the human to approve or reject via the API
5. On approval: re-enqueue the run with the decision attached — worker resumes from checkpoint
6. On rejection: emit `run.failed` with reason `rejected by human`

The worker never polls. The run state lives in Postgres. Any worker can resume any run.

---

## Scope

### 1. New stream event types (`packages/shared`)

```typescript
// Emitted when a tool requires human approval
approval.required: {
  runId: string;
  approvalId: string;   // UUID, used to approve/reject
  toolName: string;
  args: Record<string, unknown>;
  riskLevel: 'write' | 'high';
}

// Emitted when human responds (for SSE replay)
approval.resolved: {
  runId: string;
  approvalId: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}
```

### 2. New DB table — `approvals`

```sql
-- 0008_approvals.sql
CREATE TABLE approvals (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID        NOT NULL REFERENCES runs(id),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  tool_name   TEXT        NOT NULL,
  args_hash   TEXT        NOT NULL,   -- SHA-256 of args, never raw args
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected')),
  decision_by UUID        REFERENCES users(id),
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX approvals_run_id_idx    ON approvals(run_id);
CREATE INDEX approvals_tenant_id_idx ON approvals(tenant_id);
```

### 3. API endpoints (`apps/api/src/routes/approvals.ts`)

```
POST /v1/approvals/:approvalId/approve   — approve a pending tool call
POST /v1/approvals/:approvalId/reject    — reject a pending tool call
GET  /v1/runs/:runId/approvals           — list approvals for a run
```

On approve/reject:
- Verify the approval belongs to the caller's tenant
- Update `approvals` row (status, decision_by, resolved_at)
- Transition run status: `waiting_approval → running`
- Re-enqueue the run job with `{ runId, tenantId, resume: true, approvalDecision: 'approved' | 'rejected' }`
- Emit `approval.resolved` event to the Redis stream

### 4. Step engine update (`packages/core`)

When `policyDecision === 'hitl'`:
- Call `callbacks.onApprovalRequired(approvalId, toolName, args)`
- Return — do not execute the tool, do not loop
- The worker handles the pause (transitions state, writes approval row, exits)

On resume (job has `resume: true`):
- Load checkpoint
- If `approvalDecision === 'rejected'`: emit `run.failed`
- If `approvalDecision === 'approved'`: re-execute the tool that was pending, then continue the loop

### 5. Worker update (`apps/worker/src/index.ts`)

```typescript
if (job.data.resume) {
  // Load checkpoint, check approval decision, re-run from that step
  await resumeRun(redis, job.data);
} else {
  // Normal start
  await startRun(redis, job.data);
}
```

### 6. UI — Approval card (`apps/web`)

When the SSE stream emits `approval.required`, show an inline card:

```
┌─────────────────────────────────────────────────────┐
│ ⚠  Approval required                                │
│                                                     │
│  Tool:  github.merge_pr                             │
│  Repo:  suhailea/foundry                            │
│  PR:    #42                                         │
│  Risk:  HIGH                                        │
│                                                     │
│  [Approve]          [Reject]                        │
└─────────────────────────────────────────────────────┘
```

Clicking Approve/Reject calls the API, which re-enqueues the run. The SSE stream then emits `approval.resolved` and the run continues (or ends).

New components:
- `ApprovalCard.tsx` — the card shown in `RunOutput`
- `useApproval.ts` — `approve(approvalId)` / `reject(approvalId)` mutations

---

## File structure additions

```
apps/api/src/routes/
└── approvals.ts          — approve, reject, list endpoints

apps/web/src/
├── components/run/
│   └── ApprovalCard.tsx
└── hooks/
    └── use-approval.ts

packages/shared/src/
└── stream-event.ts       — add approval.required + approval.resolved
```

Migration: `0008_approvals.sql`

---

## Run state machine transitions (A4 additions)

```
running → waiting_approval   (policy gate returned hitl)
waiting_approval → running   (human approved → re-enqueued)
waiting_approval → failed    (human rejected)
```

These must be handled in `packages/core/src/run-state-machine.ts`.

---

## Done when

- [ ] `github.merge_pr` triggers `approval.required` event in the stream
- [ ] Run transitions to `waiting_approval` in the DB
- [ ] UI shows the approval card inline
- [ ] Clicking Approve re-enqueues the run and the merge executes
- [ ] Clicking Reject ends the run with `run.failed` + reason
- [ ] `approval.resolved` event emitted for SSE replay
- [ ] Audit log row written regardless of decision
- [ ] `pnpm test` passes including state machine transition tests for `waiting_approval`

---

## Drills (run before hardening)

1. **HITL gate:** Submit a run that calls `github.merge_pr` — expect run to pause at `waiting_approval`
2. **Approve path:** Click Approve — expect the merge to execute and run to complete
3. **Reject path:** Click Reject — expect `run.failed` with reason `rejected by human`
4. **Cross-tenant:** Try to approve another tenant's approval — expect `404`
5. **Double approve:** Call approve twice on the same approval — expect `409` on the second call
6. **Worker crash during approval:** Kill worker after `approval.required` emitted — expect run stays at `waiting_approval`, resumes correctly after restart + approve

---

## Key invariants

- The worker is never held waiting — it emits `approval.required` and exits the job
- The approval decision comes from the authenticated user, never from the model or the request body's tenant field
- Every tool call that hits `hitl` gets an audit log row regardless of the human's decision
