# AGENTS.md — Rulebook for AI coding agents

Every AI agent working in this repository MUST follow these rules. The
quality gates (`npm run gate`) enforce them mechanically; this file explains
the intent behind them.

## Commands

- `npm run gate` — run ALL quality gates (typecheck → lint:conventions →
  lint:antipattern → test). It must pass before you finish any change.
- `npm test` — Vitest unit + API tests only.
- `npm start` — boot the API locally on port 3000.

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

## Naming

- Files: kebab-case with role suffix — `task.controller.ts`, `task.model.ts`,
  `task.routes.ts`, `error-handler.ts`.
- Functions and variables: camelCase. Classes: PascalCase.
- One exported concept per file where natural.

## Error handling

- Controllers return proper status codes: 200/201/204 success, 400
  validation, 404 not found, 500 unexpected (via error middleware).
- Error response body shape: `{ "error": "message" }`.
- Never throw from controllers on purpose; unexpected errors bubble to the
  error middleware.

## Forbidden (anti-pattern gate)

- `any` — use precise types.
- `console.log` in `src/` (only `src/server.ts` startup logging is allowed).
- `eval` / `new Function`.
- Magic numbers — name them or take them from config. Whitelisted: HTTP
  status codes, the default port 3000, and -1/0/1 primitives.
- `async` functions without `await`.

## Testing

- Every endpoint gets a happy-path test and at least one error-path test.
- API tests import the app from `src/app.ts` (supertest) and reset model
  state in `beforeEach` via `taskRepository.reset()`.
- Test files mirror the feature they cover: `tests/<feature>.test.ts`.

## When fixing gate failures

- Make the smallest correct change.
- NEVER weaken the gates: no `eslint-disable`, no tsconfig loosening, no
  skipped or weakened tests.
- Run `npm run gate` yourself and confirm it passes before finishing.
