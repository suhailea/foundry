# Phase A3 — Orchestrator Engine v0

**Status:** Planned
**Depends on:** A2 complete ✅

---

## What this phase teaches

- How to build a real agent loop from scratch: plan → execute → checkpoint → repeat
- How a state machine enforces legal run transitions at the domain level
- How checkpointing enables crash recovery and worker hand-off
- How the planner port decouples the engine from the brain (scripted now, LLM later)
- How hard limits (max steps, wall-clock timeout, cancellation) are enforced in code

---

## The core idea

Right now the worker runs a hardcoded script. A3 replaces it with a **general-purpose step engine**:

```
while not terminal:
  decision = planner.decide(runContext)
  result   = executor.execute(decision)
  checkpoint(runContext + result)
  emit event
  check limits
```

The engine doesn't know what the planner will decide. The scripted planner returns deterministic decisions from a test script. The LLM planner (B1) implements the same interface. The engine never changes.

---

## Scope

### 1. Run state machine (already in `packages/core`, extend it)

States: `queued → running → waiting_approval → running → completed | failed | cancelled`

Add:
- `transition(from, event)` already exists — verify it covers all A3 transitions
- `IllegalTransitionError` already exists
- Add `waiting_approval` → `running` transition (for A4 resume)

### 2. Step engine (`packages/core/src/step-engine.ts`)

```typescript
interface StepEngineConfig {
  maxSteps: number;         // hard limit — default 20
  timeoutMs: number;        // wall-clock limit — default 60_000
  signal: AbortSignal;      // cancellation from outside
}

async function runStepLoop(
  planner: Planner,
  context: RunContext,
  config: StepEngineConfig,
  callbacks: StepEngineCallbacks,
): Promise<void>
```

`StepEngineCallbacks`:
- `onDecision(decision)` — emit event, log
- `onStepComplete(result)` — checkpoint, emit event
- `onLimitReached(reason)` — emit `run.failed` with reason
- `onFinalAnswer(answer)` — emit `token` + `run.completed`

The engine:
1. Checks `signal.aborted` at the top of every iteration
2. Checks step count against `maxSteps`
3. Checks elapsed time against `timeoutMs`
4. Calls `planner.decide(context)`
5. Executes the decision (tool calls go through the existing executor)
6. Appends result to `context.events`
7. Calls `onStepComplete` → checkpoint written
8. Loops

### 3. Checkpointing (`packages/core/src/checkpoint.ts`)

After every step, the full run context is serialised to Postgres:

```sql
-- Added to runs table via migration 0007
ALTER TABLE runs ADD COLUMN checkpoint JSONB;
ALTER TABLE runs ADD COLUMN step_count INTEGER NOT NULL DEFAULT 0;
```

`saveCheckpoint(runId, context)` — upserts `checkpoint` + `step_count` + `updated_at`
`loadCheckpoint(runId)` — returns `RunContext | null`

Any worker can resume any run by loading the checkpoint. The worker that picks up the job doesn't need to be the one that started it.

### 4. Scripted planner (`packages/core/src/scripted-planner.ts`)

Implements the `Planner` interface with a fixed decision sequence:

```typescript
interface ScriptedStep {
  decision: Decision;
  // Optional: assert something about the previous result before proceeding
  assert?: (lastResult: unknown) => void;
}

class ScriptedPlanner implements Planner {
  constructor(steps: ScriptedStep[]) {}
  decide(context: RunContext): Promise<Decision>
}
```

Used in:
- Worker: replaces the hardcoded script in `tool-runner.ts`
- Tests: drive the engine deterministically with known step sequences

### 5. Updated worker

`apps/worker/src/index.ts` — replaces `runScriptedAgent` with:

```typescript
const planner = buildPlanner(input, tenantId); // returns ScriptedPlanner
const engine  = new StepEngine(config);
await engine.run(planner, context, callbacks);
```

`buildPlanner` reads the input, parses `owner/repo`, returns a `ScriptedPlanner` with the right steps.

### 6. Run context evolution

`RunContext` (already in `planner.ts`) gains:
```typescript
stepCount: number;
events: StreamEvent[];        // already there
lastToolResult: unknown;      // result of the previous step's tool call
```

---

## File structure additions

```
packages/core/src/
├── step-engine.ts         — the loop
├── checkpoint.ts          — save/load (port — no pg import here)
└── scripted-planner.ts    — deterministic Planner implementation

apps/worker/src/
├── checkpoint-store.ts    — implements the checkpoint port using pg
└── index.ts               — updated to use step engine
```

**`packages/core` must not import pg.** The checkpoint port is an interface; `apps/worker/src/checkpoint-store.ts` implements it with `pg`.

---

## Migration

```sql
-- 0007_run_checkpoints.sql
ALTER TABLE runs ADD COLUMN checkpoint  JSONB;
ALTER TABLE runs ADD COLUMN step_count  INTEGER NOT NULL DEFAULT 0;
```

---

## Hard limits (non-negotiable per §11)

| Limit | Default | Behaviour on breach |
|---|---|---|
| `maxSteps` | 20 | emit `run.failed` with `reason: 'step limit reached'` |
| `timeoutMs` | 60 000 | emit `run.failed` with `reason: 'timeout'` |
| `signal.aborted` | — | emit `run.failed` with `reason: 'cancelled'` |

Hitting a limit is not an exception — it's a terminal event. The engine handles it cleanly.

---

## Done when

- [ ] `StepEngine` runs the plan → execute → checkpoint loop
- [ ] `ScriptedPlanner` drives the engine with the same github list_prs → get_pr sequence as before
- [ ] Checkpoint written to Postgres after every step
- [ ] Any worker can resume a run from its checkpoint (tested by killing the worker mid-run)
- [ ] Max steps limit enforced — run ends with `run.failed` + reason when exceeded
- [ ] Timeout limit enforced — run ends with `run.failed` + reason when exceeded
- [ ] `AbortSignal` cancels the run cleanly
- [ ] `pnpm test` passes including step engine unit tests (scripted planner drives known sequences)
- [ ] UI still streams correctly (no change to SSE contract)

---

## Drills (run before hardening)

1. **Step limit:** Set `maxSteps: 2` on a 3-step script — expect `run.failed` with `step limit reached`
2. **Timeout:** Set `timeoutMs: 1` — expect `run.failed` with `timeout`
3. **Crash recovery:** Kill the worker after step 1 of a 2-step run, restart — expect the run to resume from step 1 checkpoint and complete
4. **Cancellation:** Send a cancel signal mid-run — expect `run.failed` with `cancelled`, no further tool calls
5. **Illegal transition:** Try to transition a `completed` run back to `running` — expect `IllegalTransitionError`
6. **Empty script:** ScriptedPlanner with zero steps — expect immediate `run.failed`, not a hang

---

## Key invariant reminder (§11)

> Every run emits exactly one terminal event. The client never hangs.

The step engine is responsible for this. Every exit path — normal completion, limit breach, crash, cancellation — must emit either `run.completed` or `run.failed`.
