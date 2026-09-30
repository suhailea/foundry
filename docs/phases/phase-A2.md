# Phase A2 — Tool Layer

**Status:** Planned
**Depends on:** A1 complete ✅

---

## What this phase teaches

- How to build a safe, extensible tool registry (schema, risk tags, permissions)
- How to execute tools with input validation (Zod) and output sanitisation
- How the policy gate decides: allow / require human approval / block
- How to maintain an audit log of every tool call (who, what, result, when)
- How the gateway decrypts OAuth tokens at call time — no other layer ever sees plaintext

---

## Scope

### 1. Tool registry (`packages/core`)

Each tool is described by a **tool card**:

```typescript
interface ToolCard {
  name: string;           // e.g. 'github.list_prs'
  description: string;
  inputSchema: ZodSchema; // validated before execution
  risk: 'read' | 'write' | 'high'; // drives policy gate
  requiredIntegration: string | null; // e.g. 'github'
}
```

Tools registered for A2:
| Name | Risk | What it does |
|---|---|---|
| `github.list_prs` | read | List open PRs for a repo |
| `github.get_pr` | read | Get PR details + diff |
| `github.add_comment` | write | Post a comment on a PR |
| `github.merge_pr` | high | Merge a PR |

### 2. Tool executor (`packages/core`)

```
validateArgs(schema, args)   → throws on invalid input
policyGate(card, context)    → 'allow' | 'hitl' | 'block'
execute(card, args, token)   → ToolResult
resultGuard(result)          → sanitised ToolResult
auditLog(entry)              → persisted to DB
```

- Read tools may run in parallel; write/high tools run sequentially
- A tool failure returns `{ ok: false, error: string }` — never throws past the executor boundary
- `AbortSignal` passed through to every async tool call

### 3. GitHub gateway (`apps/api` or `apps/worker`)

- Decrypts the tenant's GitHub token from the `integrations` table at call time
- Makes the GitHub API call with the decrypted token
- Token never appears in logs, traces, or return values
- Returns a typed result that the executor passes to `resultGuard`

### 4. Policy gate (`packages/core`)

Simple rule table for A2 (no LLM involvement yet):

| Risk | Default action |
|---|---|
| `read` | allow |
| `write` | allow (logged) |
| `high` | hitl — pause run, emit `approval.required` event |

The gate is a pure function: `(card: ToolCard, context: PolicyContext) => PolicyDecision`.

### 5. Audit log

New table `tool_calls`:
```sql
id, run_id, tenant_id, tool_name, input_hash, result_summary,
policy_decision, duration_ms, created_at
```
- `input_hash` — SHA-256 of serialised args (never raw args if they contain tokens)
- `result_summary` — first 500 chars of result, secrets redacted

### 6. UI additions

- `/runs/:runId` detail view — show tool call events inline in the stream:
  - `tool.requested` → grey card with tool name + args
  - `tool.result` → card updates with result summary (green) or error (red)
- New stream event types added to `packages/shared`:
  - `tool.requested`: `{ toolName, args }`
  - `tool.result`: `{ toolName, ok, summary }`

---

## Out of scope for A2

- HITL approval UI (that's A4)
- MCP servers (A5)
- Token refresh (implement when a token actually expires — not yet)
- Jira and Slack tools

---

## Stack additions

None. Everything uses existing stack. GitHub calls are plain `fetch` against the GitHub REST API.

---

## File structure additions

```
packages/core/src/
├── tool-registry.ts       — register(), get(), list()
├── tool-executor.ts       — execute(), validateArgs(), resultGuard()
└── policy-gate.ts         — policyGate() pure function

apps/worker/src/
└── gateways/
    └── github.ts          — decryptAndCall(), typed GitHub API wrappers

apps/api/src/
└── routes/
    └── tool-calls.ts      — GET /v1/runs/:runId/tool-calls (audit log)
```

New migration: `0006_tool_calls.sql`

---

## Done when

- [ ] Tool registry holds all 4 GitHub tools with correct risk tags
- [ ] `validateArgs` rejects invalid input with a typed error (tested)
- [ ] Policy gate returns correct decision for each risk level (tested)
- [ ] `github.list_prs` executes end-to-end using the stored encrypted token
- [ ] Tool result never contains the raw access token
- [ ] Audit log row written for every tool call
- [ ] `tool.requested` and `tool.result` events emitted to the Redis Stream
- [ ] UI shows tool call cards inline in the run detail view
- [ ] `pnpm test` passes including policy gate and executor unit tests

---

## Drills (run before hardening)

1. **Bad args:** Call the executor with an arg that fails the Zod schema — expect a typed error, not a 500
2. **Missing integration:** Call `github.list_prs` for a tenant with no GitHub token — expect `{ ok: false, error: 'Integration not connected' }`, not a crash
3. **High-risk gate:** Call `github.merge_pr` — expect `hitl` decision, run pauses with `approval.required` event
4. **Token in logs:** After a tool call, grep worker logs for the GitHub token — expect zero matches
5. **Cross-tenant token:** Manually pass another tenant's `tenant_id` to the gateway — expect 404, not their token
6. **Result guard:** Return a result containing a string that looks like a secret (`ghp_...`) — expect it redacted in the audit log

---

## Key invariant reminder

> The LLM never executes anything. The orchestrator makes every call; the model only returns structured decisions.

In A2, the echo agent is replaced by a **scripted tool caller** — a hardcoded sequence of tool calls to prove the executor works end-to-end before the LLM planner arrives in B1.
