# AI Self-Healing CI/CD Demo — Design Spec

**Date:** 2026-10-28
**Status:** Approved
**Repo:** `agents-ci-cd`

## Purpose

Demonstrate an AI agent that writes application code, pushes it through a CI/CD
pipeline, and **self-fixes quality-gate failures** in a bounded retry loop.
The demo shows AI autonomously following project quality rules (coding
conventions, anti-pattern rules, type safety, tests) without human intervention.

Everything runs inside GitHub Actions — the demo is fully self-contained and
observable in the Actions tab.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| AI runtime | Headless Claude Code (`claude -p`) inside GitHub Actions runner |
| Framework | Express + TypeScript, hand-rolled MVC |
| Quality gates | Core 4: typecheck, lint-conventions, lint-antipatterns, tests |
| Retry config | Checked-in `.ai-ci.json` |
| Demo trigger | `workflow_dispatch` with two modes: `task` and `seed-bug` |
| Fix loop wiring | Internal loop inside one job; fix commits carry `[skip ci]` |

## 1. The Application

A small **Task manager** Web API: CRUD on `/api/tasks`, in-memory model, no
database, no auth. Chosen for universal recognizability and small surface area.

- **Runtime:** Node 20, npm, TypeScript (strict), Express 4
- **Tests:** Vitest + supertest

### Structure

```
src/
  controllers/    # HTTP layer: validate input, call model, shape responses
    task.controller.ts
  models/         # types + in-memory repository
    task.model.ts
  routes/         # Express router wiring
    task.routes.ts
  middleware/     # error handler, 404 handler
    error-handler.ts
    not-found.ts
  app.ts          # express app assembly (exported for tests)
  server.ts       # listen entrypoint
tests/
  tasks.api.test.ts
CLAUDE.md         # conventions rulebook the AI agent must follow
```

### API

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/tasks` | list all tasks |
| GET | `/api/tasks/:id` | get one (404 if missing) |
| POST | `/api/tasks` | create (`title` required; `done` defaults false) |
| PUT | `/api/tasks/:id` | update title/done (404 if missing) |
| DELETE | `/api/tasks/:id` | delete (404 if missing) |

Errors return `{ "error": "message" }` with proper status codes. Validation
errors are 400, not-found 404, unexpected errors 500 via error middleware.

### CLAUDE.md (the rulebook)

Load-bearing file: the CI agent reads it before writing or fixing code.
Contains:

- MVC layering rules (controllers never touch data structures directly;
  models never import Express; routes only wire)
- Naming conventions (files `kebab-case`/`*.controller.ts`, classes, functions)
- Error-handling pattern (throw/handle via middleware, response shape)
- Test requirements (every endpoint has happy-path + error-path tests)

## 2. Quality Gates

Four npm scripts, each producing distinct, actionable failure output the AI
can read:

| # | Gate | Command | Failure class demonstrated |
|---|---|---|---|
| 1 | Typecheck | `npm run typecheck` → `tsc --noEmit` (strict) | compiler errors |
| 2 | Conventions | `npm run lint:conventions` → ESLint flat config #1 | naming, `no-unused-vars`, import order (`import/order`) |
| 3 | Anti-patterns | `npm run lint:antipattern` → ESLint flat config #2 | `@typescript-eslint/no-explicit-any`, `no-console`, `no-eval`, `no-magic-numbers`, `@typescript-eslint/require-await` |
| 4 | Tests | `npm run test` → `vitest run` | behavioral failures |

Two **separate** ESLint flat configs (`eslint.config.conventions.mjs`,
`eslint.config.antipattern.mjs`) so CI logs name the failing rule category.

Umbrella script `npm run gate` runs all four sequentially, stopping at the
first failure (used by CI and by the retry loop).

## 3. Retry Configuration — `.ai-ci.json`

Checked into the repo root; the workflow reads it before the fix loop:

```json
{
  "maxRetries": 3,
  "model": "claude-sonnet-5",
  "baseBranch": "develop"
}
```

Changing `maxRetries` and pushing is itself part of the demo (config is
versioned and visible).

## 4. Branch Model

- **`main`** — stable demo app. Scaffold (app + CI) lands here first;
  `develop` branches from it afterward.
- **`develop`** — AI working branch. Task implementations and gate fixes are
  pushed here.
- **PR `develop` → `main`** — gates run as a blocking check. If the AI fixes
  anything on a PR, fixes are pushed to the PR head branch, never to `main`.

## 5. Workflows

### 5.1 `demo.yml` — demo starter (`workflow_dispatch`)

Inputs:
- `mode`: `task` | `seed-bug` (default `seed-bug`)
- `taskPrompt`: free-text feature instruction (used in `task` mode)
  e.g. *"add GET /api/tasks?done=false filtering"*

Job `implement` (runs on `develop`):
- **task mode:** install Claude Code CLI, run `claude -p` with CLAUDE.md +
  the task prompt, constrained to repo files; commit + push to `develop`.
- **seed-bug mode:** run `node scripts/seed-bugs.mjs`, which applies a
  deterministic patch injecting known violations — one per gate, so **all 4
  gates fail** deterministically:
  - a strict-mode type error (gate 1 fails)
  - an unused import + unused variable (gate 2 fails)
  - `any` type + `console.log` + magic number in a controller (gate 3 fails)
  - one broken unit test (gate 4 fails)
  The script is idempotent-guarded: it fails fast with a clear message if the
  seed patch is already applied. Commit message:
  `chore(demo): seed bugs for self-fix demo`. Push to `develop` — **no skip
  marker**, so the push triggers `quality-gate.yml`.

### 5.2 `quality-gate.yml` — gate + self-fix loop

Triggers:
- `push` to `develop`
- `pull_request` targeting `main`

Job `gate-and-fix` (runs on the pushed branch / PR head):

```
read .ai-ci.json → maxRetries, model
for attempt in 0..maxRetries:
    run npm run gate (4 gates, capture output)
    if pass: exit green ✅
    if attempt == maxRetries: exit red ❌ (retries exhausted)
    install Claude Code CLI
    claude -p "You are fixing CI gate failures. Follow CLAUDE.md.
               Gate output: <captured logs>. Fix the code."
    commit "[ai-fix attempt N/M] [skip ci]" → push to same branch
```

Key wiring choices:
- **Internal loop:** gates re-run inside the same job; one Actions run shows
  the entire attempt history. No cross-workflow state passing.
- **`[skip ci]` marker** on fix commits prevents re-triggering the workflow
  on the AI's own pushes (no recursion).
- **Auth:** `ANTHROPIC_API_KEY` stored as a GitHub secret; exact headless CLI
  flags verified against current docs at implementation time.
- On PRs, the loop is identical; the AI pushes to the PR head branch.

## 6. Demo Flow (the story told to viewers)

1. Operator runs **Demo** workflow (Actions → Run workflow → `seed-bug`).
2. `demo.yml` injects bugs, pushes to `develop`.
3. `quality-gate.yml` fires: gates fail (typecheck, anti-patterns, tests).
4. AI reads `CLAUDE.md` + failure logs → fix commit
   (`[ai-fix attempt 1/3] [skip ci]`).
5. Gates re-run inside the same job. Repeat until green — or red after
   `maxRetries` (exhaustion is also a demo outcome).
6. `develop` commit history shows AI-authored fix commits with attempt
   numbers; the Actions log shows the full battle.

## 7. Out of Scope (YAGNI)

- Database, auth, Docker, deployment target
- Coverage thresholds, formatter gate, SonarCloud/CodeQL
- Issue-driven feature requests
- Multi-AI comparison, cost tracking dashboards

## 8. Success Criteria

1. Pristine scaffold on `main`/`develop` passes all 4 gates green.
2. `seed-bug` demo run: gates fail, AI fixes within `maxRetries`, final
   gate run is green, fix commits visible on `develop`.
3. `task` demo run: AI implements a small feature that passes gates
   (possibly after fix iterations).
4. Changing `maxRetries` in `.ai-ci.json` changes loop behavior on the next
   run — no workflow YAML edit required.
5. PR `develop` → `main` blocks on the gate check.
