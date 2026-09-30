# ADR 0001 — API Framework

**Date:** 2026-09-29
**Status:** Accepted

---

## Context

Foundry needs an HTTP framework for `apps/api`. The project's primary goal is learning: every layer should be visible and understood, not hidden behind framework abstractions. `apps/api` is thin by design — it validates input, enqueues jobs, and streams events.

---

## Options Considered

| | Hono | NestJS |
|---|---|---|
| Bundle size / startup | Tiny | Heavy |
| TypeScript integration | Native, no decorators | Decorator-based (`experimentalDecorators`) |
| Middleware model | Simple function chain | Module/provider DI |
| Web Standards alignment | Yes (Request/Response) | No |
| Learning value for this project | High — nothing is hidden | Low — DI and modules obscure the wiring |

---

## Decision

**Hono + Zod.**

Hono handles routing and middleware. Zod validates every HTTP boundary. No NestJS anywhere in the project.

---

## Consequences

- `apps/api` wires its own middleware stack (auth, rate limit, request ID) — intentional, it's part of the learning.
- Dependencies are passed explicitly; no DI container.

---

## What Would Make Us Revisit

- API surface grows to 20+ route groups with complex cross-cutting DI needs.
- A team member joins where NestJS knowledge is a meaningful productivity advantage.
