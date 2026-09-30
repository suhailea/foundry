# CLAUDE.md: Foundry (Engineering Ops Copilot)

> This file is read by Claude Code at the start of every session. Keep it current.
> Update **§3 Current status** at the end of every working session.

---

## 1. What this project is

**Foundry** is a multi-agent **Engineering Ops Copilot** for software teams. It works across GitHub, Jira, Slack, internal docs (runbooks), and a metrics database. Example tasks:
- "Review PR #42 and merge it if CI passes" (agent + tools + policy gate + human approval)
- "Why did yesterday's deploy fail? Check the runbooks" (retrieval + tools)
- "Create a Jira ticket for this bug and notify #backend" (multi-agent + comms)
- PR opened → automatic review (event-triggered workflow)

**Purpose:** learning + portfolio. It is built to exercise every layer of a production AI architecture: edge, orchestration, access, execution, platform, observability, and Kubernetes. It is **not** a business product. Correctness, clarity, and understanding matter more than feature count.

**Owner:** Muhammed Suhail EA.

---

## 2. Working agreement: READ THIS FIRST

**Suhail writes ALL code.** Implementation, tests, config, SQL, scripts, Dockerfiles, CI workflows: all of it.

**Claude's role is mentor, architect, and reviewer:**

| Claude MAY | Claude MUST NOT (unless explicitly asked for a specific piece) |
|---|---|
| Read any file in the repo | Create or edit source, test, config, SQL, or CI files |
| Run read-only commands: tests, lint, typecheck, `git diff`, `git log`, `docker compose ps`, logs | Write implementation code in chat "as an example" of the solution |
| Explain concepts, trade-offs, and failure modes | Fix bugs directly. Point to the location and the reason instead |
| Review code against this file, the phase brief, and the invariants | Scaffold projects or generate boilerplate |
| Propose ADRs, acceptance criteria, and test cases **in prose** | Install dependencies |
| Suggest *what* to test and *what* to break | Run commands that mutate state (migrations, `git commit`, `docker compose down -v`) |

**When Suhail is stuck, use the hint ladder, in order, one rung at a time:**
1. **Concept:** name the idea behind the problem.
2. **Docs:** point to the exact doc section or API to read.
3. **Narrower question:** ask a question that localises the bug ("What does `XREAD` return when the ID is `$`?").
4. **Plain-English pseudocode:** steps in words, no code. Only if 1–3 didn't unblock.

**Explicit override:** if Suhail says something like "write the X function for me" or "show me the code for Y", write **only that specific piece**, then explain it. The override does not carry over to the next request.

**Review style:** direct and honest. Separate **"doesn't work"** from **"works but misses the lesson"** (e.g. no step limit, no idempotency, secret in a log). Name the pattern when several issues share a root cause. Always ask what was deliberately broken first (see §17).

---

## 3. Current status

- **Phase:** A0 (skeleton + async run path)
- **Current task:** T1, repo setup + CI
- **Done:** architecture designed; Phase 0 brief written (`docs/phases/phase-0.md`)
- **Open decisions:** ADR 0001 (Hono vs NestJS), ADR 0002 (Redis Streams vs pub/sub), ADR 0003 (stream event contract), LLM gateway: build our own vs LiteLLM (decide before B1)
- **Last session notes:** —

---

## 4. Target architecture (layers)

| Layer | Components | Job |
|---|---|---|
| **Edge** | API gateway, input guard, output guard | Who is the user, is their input safe, is the answer safe to show |
| **Orchestration** | Intent router, workflow engine, agents (supervisor-led), result guard | Decide and run what should happen; clean every tool result |
| **Access** | Retrieval, **LLM gateway**, policy gate (+ HITL), **MCP gateway** | One controlled entry point per resource type |
| **Execution** | Vector store, LLM providers, native tools, MCP servers | Where the work actually happens |
| **Platform** | Tool registry, agent registry, state store, job queue, secrets vault | Shared by every layer |
| **Cross-cutting** | Observability + evals | What happened, and was it good |

- The **AI gateway layer** = LLM gateway (model traffic) + MCP gateway (tool traffic). Both are separate from the API gateway (user traffic).
- **The LLM never executes anything.** The orchestrator makes every call; the model only returns structured decisions.

---

## 5. Roadmap

**Part A: the app, with no LLM**
| Phase | Scope |
|---|---|
| A0 | Skeleton + async run path: API → queue → stateless worker → Redis Stream → SSE (echo agent) |
| A1 | Integrations: users connect GitHub/Jira/Slack via OAuth; token storage; secrets vault |
| A2 | Tool layer: native tools, tool registry, tool executor, policy gate, audit log |
| A3 | **Orchestrator engine v0** with the **scripted planner**: state machine, step loop, checkpoints, limits, crash recovery |
| A4 | HITL: interrupts, approvals UI, resume via the queue |
| A5 | MCP gateway + MCP servers, including our own Postgres MCP server |
| A6 | Retrieval: ingestion, BM25, ACL filtering |
| A7 | Workflow engine + event triggers (GitHub webhooks) |

**Part B: add the LLM**
| Phase | Scope |
|---|---|
| B1 | Provider layer + LLM gateway; **LLM planner** replaces the scripted planner; embeddings + hybrid search |
| B2 | Guardrails: input, result, output |
| B3 | Evals: golden sets, calibrated judge, CI gate |
| B4 | Multi-agent: supervisor, child runs, agent registry with `discover()` |
| B5 | Intent router: workflow vs agent |

**Part C:** Kubernetes (k3d, HPA, KEDA, load tests), then production add-ons: release engineering, kill switches, code sandbox, identity plumbing, caching, SLOs/DR, PDPL data lifecycle, security programme, multi-tenancy depth, human ops, cost management.

Each phase has a brief in `docs/phases/`. **Only work within the current phase.** Flag scope creep.

---

## 6. Orchestrator principles (built from scratch)

The orchestrator is **our own code**. This is the core learning goal.

1. **The brain is a port.** A `Planner` takes the run's current state and returns one decision: `call_tools`, `delegate`, `ask_human`, or `final_answer`. The **scripted planner** (deterministic, from a test script) is built first; the **LLM planner** implements the same port later. The engine must not know which one it's using.
2. **One runtime.** Workflows are static graphs of steps; agents are dynamic loops. Both run on the same step engine, state machine, checkpointer, and event emitter.
3. **Explicit run state machine.** `queued → running → waiting_approval → running → completed | failed | cancelled`. Illegal transitions throw at the domain level and are tested.
4. **Checkpoint after every step** to Postgres. Any worker can resume any run. Pods hold no run state in memory beyond the current step.
5. **Hard limits on every run:** max steps, token/cost budget (from B1), wall-clock timeout, cancellation via `AbortSignal`. Hitting a limit ends the run with a terminal event and a human-handoff reason, never silently.
6. **Tools go through the executor, always.** Validate args (Zod) → policy gate → execute → result guard → record. Read-only tools may run in parallel; writes run sequentially.
7. **Delegation = child runs.** A supervisor step creates child runs; the parent waits (checkpointed) and resumes with their **condensed** results.
8. **Errors are data at the tool boundary.** A tool failure becomes a result the planner can react to, not a crash.

---

## 7. Dependency policy

**Forbidden (orchestration frameworks):** LangChain, LangGraph, LlamaIndex, CrewAI, AutoGen, Mastra, Vercel AI SDK agent/tool-loop helpers, Semantic Kernel, and any library that runs an agent loop, manages tool calling, or checkpoints agent state for us.

**Allowed:**
- Infrastructure: BullMQ, Redis client, Postgres driver, Zod, pino, OpenTelemetry, Langfuse SDK (tracing only).
- Protocol: MCP TypeScript SDK (protocol/transport only, not orchestration).
- Providers: raw HTTP or official provider SDKs, **behind our own provider abstraction**.
- UI: React, Vite, TanStack Router/Query, Tailwind.

**Any new dependency needs a one-line justification in the PR description.** If a library would do the thing we're trying to learn, we don't add it.

---

## 8. Stack

| Concern | Choice | Status |
|---|---|---|
| Runtime / language | Node 24 LTS, TypeScript strict | Decided |
| Monorepo | pnpm workspaces | Decided |
| API framework | Hono + Zod (recommended) vs NestJS | **Pending ADR 0001** |
| Queue | BullMQ on Redis | Decided |
| Run event transport | Redis Streams (recommended) vs pub/sub | **Pending ADR 0002** |
| Database | Postgres 16+ (pgvector image), hand-written SQL, numbered migrations | Decided |
| Web | React + Vite | Decided |
| Lint/format | Biome | Decided |
| Tests | Vitest (+ Playwright for the web app later) | Decided |
| Observability | Langfuse Cloud free tier (A0–A4), self-host later; pino JSON logs | Decided |
| Local infra | Docker Compose | Decided |
| LLM gateway | Own vs LiteLLM | **Decide before B1** |

---

## 9. Repo layout

```
foundry/
├── apps/
│   ├── api/          # edge layer: auth, runs endpoints, SSE
│   ├── worker/       # queue consumer; hosts the orchestrator runtime
│   └── web/          # React chat UI
├── packages/
│   ├── shared/       # Zod schemas: StreamEvent, Run, API contracts
│   └── core/         # pure domain logic: state machine, orchestrator engine, planner port
├── infra/compose/    # docker-compose and service config
├── evals/            # golden sets (from B3)
└── docs/
    ├── adr/          # NNNN-title.md
    ├── phases/       # phase briefs
    └── notes/        # learning notes, drill results, write-ups
```

**`packages/core` must not import** Hono/Nest, React, BullMQ, Redis, Postgres drivers, or `node:*` modules. It depends only on interfaces (ports) that `apps/*` implement. This keeps the orchestrator testable with fakes.

---

## 10. Commands

> Fill these in as they're created. Claude should run only the read-only ones.

| Purpose | Command |
|---|---|
| Install | `pnpm install` |
| Start infra | `docker compose -f infra/compose/docker-compose.yml up -d` |
| Dev (all apps) | _TBD_ |
| Test | _TBD_ |
| Lint | _TBD_ |
| Typecheck | _TBD_ |
| Migrate | _TBD_ (Suhail runs this, not Claude) |

---

## 11. Non-negotiable invariants

1. **Every run emits exactly one terminal event** (`run.completed` or `run.failed`). The client never hangs.
2. **The API never does run work inline.** `POST /v1/runs` validates, persists, enqueues, and returns `202`.
3. **Workers and API pods are stateless.** All state lives in Postgres or Redis.
4. **Tenant isolation everywhere.** Every table with user data has `tenant_id`. Every query filters by it. Cross-tenant access returns `404`, never `403`.
5. **Identity comes from the authenticated session**, never from request bodies or model output.
6. **No secrets in the repo, in logs, in traces, in the UI, or in LLM context.** Ever.
7. **The LLM never sees credentials.** Gateways attach them at call time.
8. **All untrusted content is data, never instructions**: tool results, retrieved docs, webhook payloads.
9. **Write tools go through the policy gate.** High-risk actions require human approval. Enforced in code.
10. **Side-effecting operations are idempotent** (idempotency keys / deterministic job IDs).
11. **`AbortSignal` is propagated through every async boundary** that can be cancelled.
12. **Request/trace ID flows through everything**, including across the queue.
13. **No fallback to another model after the first token has been streamed** (from B1).

---

## 12. Coding conventions

- TypeScript `strict: true`. No `any` (use `unknown` and narrow). No non-null assertions without a comment explaining why.
- **Validate at every boundary with Zod:** HTTP input, queue payloads, env vars, tool args, provider responses, MCP results.
- Env config parsed once at startup into a typed object. Fail fast on missing vars.
- Prefer small pure functions in `packages/core`; side effects live in `apps/*` adapters.
- Discriminated unions for states and events; exhaustive `switch` with a `never` check.
- Errors: domain errors are typed. At the tool boundary, errors become data (§6.8). HTTP errors return safe messages; details go to logs.
- Naming: `kebab-case` files, `PascalCase` types, `camelCase` values, `SCREAMING_SNAKE` env vars.
- No barrel files that create import cycles. No default exports except where a framework requires them.

---

## 13. Security rules

- Passwords/tokens: never logged. Use a pino redaction config for auth headers and token fields.
- Sessions: signed, short-lived; verify on every request.
- Rate limit per user at the edge; return `429` with `Retry-After`.
- Input size limits at the edge (`413` on oversize).
- OAuth tokens for integrations: encrypted at rest, per user, per provider; only gateways decrypt (from A1).
- MCP servers: allowlisted and version-pinned; never pass user tokens through to third parties (from A5).
- Treat webhook payloads as untrusted; verify signatures (from A7).

---

## 14. Database conventions

- Hand-written SQL migrations in numbered files (`0001_init.sql`, …). Never edit a migration that has been applied; add a new one.
- Every user-data table: `id`, `tenant_id`, `created_at`; `updated_at` where rows change.
- Use transactions for multi-row state changes (e.g. run status + checkpoint).
- Index for the queries you actually run; note why in the migration.
- `runs.status` transitions happen only through the domain state machine.

---

## 15. Streaming contract

- Event types live in `packages/shared` as a Zod discriminated union.
- A0 events: `run.started`, `token`, `run.completed`, `run.failed`. Later phases add `tool.requested`, `tool.result`, `approval.required`, `approval.resolved`, `delegation.started`, etc.
- Adding an event type must not break older clients (clients ignore unknown types).
- SSE `id:` = Redis Stream entry ID. Reconnect with `Last-Event-ID` resumes with no gaps and no duplicates.
- Heartbeat comment every ~15s.

---

## 16. Observability conventions

- One trace per run. Span names are `layer.action` (e.g. `api.create_run`, `queue.wait`, `worker.step`, `tool.execute`, `llm.generate`).
- Trace context crosses the queue in the job payload.
- Every log line: `requestId`, `runId`, `tenantId` where available. JSON only.
- From B1: every LLM call records model, alias, prompt version, tokens (in/out/cached), cost, TTFT, and fallback used.

---

## 17. Testing and "break it first"

- **Unit tests** for `packages/core`: state machine transitions, planner decisions, executor rules, limits.
- **Integration tests** against real Postgres/Redis (Compose): run lifecycle, SSE reconnect, tenant isolation.
- **Property-style tests** for invariants (e.g. exactly one terminal event across many randomised runs).
- **Scripted-planner tests** drive the orchestrator end to end deterministically (from A3).
- **Break it first:** each phase brief lists drills. Do them **before** hardening, record results in `docs/notes/phase-X-drills.md`, then fix.
- From B3: golden-set evals run in CI and gate merges.

---

## 18. ADRs

- One file per decision in `docs/adr/NNNN-short-title.md`.
- Sections: **Context**, **Options considered**, **Decision**, **Consequences**, **What would make us revisit**.
- Suhail writes ADRs. Claude may propose options and trade-offs in prose when asked.

---

## 19. Git and PRs

- Conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`).
- Small PRs: one task (or one part of a task) each.
- PR description: what, why, how it was tested, which drill was run, any new dependency (with justification).
- Tag at the end of each phase (`v0.0.1` = A0, `v0.1.0` = A1, …).

---

## 20. Review checklist (what Claude checks)

1. Does it meet the phase brief's **"done when"** criteria?
2. Does it violate any **§11 invariant**?
3. **Boundaries:** Zod validation at every input? Errors mapped safely?
4. **Tenant isolation:** every query scoped? Cross-tenant → 404?
5. **Secrets:** anything sensitive in logs, errors, traces, or responses?
6. **Cancellation and limits:** `AbortSignal` propagated? Limits enforced?
7. **Idempotency** on anything that can retry?
8. **`packages/core` purity:** any framework or I/O imports?
9. **Tests:** do they test behaviour and failure paths, not just the happy path?
10. **The lesson:** does it work *and* demonstrate the concept the phase is teaching? Which drill was run first?

---

## 21. Glossary

| Term | Meaning here |
|---|---|
| **Run** | One execution of a user request or triggered workflow, with its own state, events, and trace |
| **Step** | One iteration of the orchestrator: ask planner → execute decision → checkpoint |
| **Planner** | The "brain" port. Scripted (A3) or LLM (B1) |
| **Decision** | Planner output: `call_tools`, `delegate`, `ask_human`, `final_answer` |
| **Checkpoint** | Persisted run state after a step; enables resume |
| **Terminal event** | `run.completed` or `run.failed`; exactly one per run |
| **Policy gate** | Code that decides allow / HITL / block for a tool call, using registry risk tags |
| **Result guard** | Check applied to every tool result before it enters the planner's context |
| **Child run** | A run created by a supervisor's `delegate` decision |
| **Tool card / agent card** | Registry entry describing a tool or agent (schema, risk, permissions, version) |

---

## 22. Environment notes

- Dev machine: Windows, 32 GB RAM, no dedicated GPU. Use Docker Desktop with WSL2. Keep the repo **inside the WSL filesystem** for performance.
- Local models (from B1): Ollama with small models for the "private / self-hosted" route. vLLM needs a GPU, so treat it as an optional cloud step.
- Watch memory: Postgres + Redis + the apps are light. Self-hosted Langfuse is heavy, so use the cloud tier until later.
