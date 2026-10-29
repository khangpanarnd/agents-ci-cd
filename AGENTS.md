# AGENTS.md — Rulebook for AI coding agents

Every AI agent working in this repository MUST follow these rules. The
quality gates (`npm run gate`) enforce them mechanically; this file explains
the intent behind them.

## Commands

- `npm run gate` — run ALL quality gates (typecheck → lint:conventions →
  lint:antipattern → test). It must pass before you finish any change.
- `npm run typecheck`, `npm run lint:conventions`, `npm run lint:antipattern`,
  `npm test` — run one gate alone for a faster feedback loop.
- `npm start` — boot the API locally on port 3000.
- `scripts/**` is excluded from the lint gates by design.

## MVC layering (Express + TypeScript)

- `src/controllers/` — HTTP layer ONLY: read the request, validate input,
  call the model, shape the response. No data storage, no business state.
- `src/models/` — types + in-memory data. Must NOT import anything from
  `express`.
- `src/routes/` — wiring only: map HTTP method + path to controller
  functions. No logic.
- `src/middleware/` — cross-cutting handlers (errors, 404).
- `src/app.ts` assembles the app (exported for supertest); `src/server.ts`
  boots it.

## Naming and parameters

- Files: kebab-case with role suffix — `task.controller.ts`, `task.model.ts`,
  `task.routes.ts`, `error-handler.ts`.
- Functions and variables: camelCase. Classes: PascalCase.
- One exported concept per file where natural.
- Unused parameters: prefix with `_` (e.g. `_req`, `_next`). NEVER delete a
  parameter to silence an unused-variable error — Express middleware arity
  is load-bearing (the error handler is recognized by its 4 parameters;
  dropping `_next` silently breaks 500 handling).

## Error handling

- Controllers return proper status codes: 200/201/204 success, 400
  validation, 404 not found, 500 unexpected (via error middleware).
- Error response body shape: `{ "error": "message" }`.
- Never throw from controllers on purpose; unexpected errors bubble to the
  error middleware.

## Conventions gate

Enforced on `src/` and `tests/`: no `var` (use `const`/`let`), `eqeqeq`,
no unused variables, and type-only imports must use the type form:
`import type { Request, Response } from 'express';`.

## Forbidden (anti-pattern gate)

- `any` — use precise types.
- `console.*` anywhere in `src/` or `tests/` (only `src/server.ts` may log).
- `eval` / `new Function`.
- Magic numbers in `src/` (tests may assert on raw values). Whitelist
  exactly: 200, 201, 204, 400, 404, 500, 3000, and -1/0/1. Name anything
  else.
- `async` functions without `await`.

## Testing

- Every endpoint gets a happy-path test and at least one error-path test.
- API tests import the app from `src/app.ts` (supertest) and reset model
  state in `beforeEach` via `taskRepository.reset()`.
- Test files mirror the feature they cover: `tests/<feature>.test.ts`.

## When fixing gate failures

- Make the smallest correct change.
- NEVER weaken the gates: no `eslint-disable`, and no edits to
  `eslint.config.conventions.mjs`, `eslint.config.antipattern.mjs`,
  `tsconfig.json`, `vitest.config.ts`, `scripts/run-gates.mjs`, or the gate
  scripts in `package.json`. No skipped or weakened tests.
- Run `npm run gate` yourself and confirm it passes before finishing.
