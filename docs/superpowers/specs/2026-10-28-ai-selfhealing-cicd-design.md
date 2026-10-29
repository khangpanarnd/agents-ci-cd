# AI Self-Healing CI/CD Demo — Design Spec

**Date:** 2026-10-28
**Status:** Approved (as-built notes below)
**Repo:** `agents-ci-cd`

> **As-built notes (2026-10-30):** implemented per this spec with these
> deltas — the seed/task push (GITHUB_TOKEN) cannot itself trigger
> `quality-gate.yml`, so `demo.yml` carries its own `gate-and-fix` job;
> the conventions gate ships without `import/order`; `model` is passed to
> claude-code only; the dispatcher edits files only — the workflow records
> and pushes commits; `gate-and-fix.sh` takes an optional 3rd
> branch argument (needed for workflow_dispatch, where `GITHUB_REF_NAME`
> names the dispatching branch).

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
| AI runtime | **Pluggable coding-agent adapters** running headless inside the GitHub Actions runner — v1 ships Claude Code, Codex CLI, Copilot CLI, Kiro CLI; agent selected via `.ai-ci.json` |
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

Umbrella script `npm run gate` (implemented by `scripts/run-gates.mjs`) runs
**all four checks unconditionally and aggregates their output** into one
report, failing if any check failed. The AI therefore sees every violation in
a single prompt and can fix them in one round instead of burning one retry
per gate.

## 3. Agent Adapters — any coding agent can be the CI fixer

The workflow never calls an agent CLI directly. All AI invocations (feature
implementation **and** gate fixing) go through one dispatcher script:

```
scripts/ai-agent.mjs --mode fix    --prompt-file <gate-logs.txt>
scripts/ai-agent.mjs --mode task   --prompt "<task prompt>"
```

The dispatcher reads `.ai-ci.json` → `agent` field, picks the adapter from an
in-file registry, verifies the adapter's required env secrets are present
(fails fast with a clear message naming the missing var), and spawns the CLI.
Adding a new agent = one ~15-line registry entry.

### Adapter registry (v1)

| Agent id | Binary | Install | Auth env | Headless invocation |
|---|---|---|---|---|
| `claude-code` | `claude` | `npm i -g @anthropic-ai/claude-code` | `ANTHROPIC_API_KEY` | `claude --bare -p "<prompt>" --allowedTools "Bash,Read,Edit" [--model <model>]` |
| `codex` | `codex` | `npm i -g @openai/codex` | `OPENAI_API_KEY` | `codex exec --sandbox workspace-write --skip-git-repo-check --ephemeral "<prompt>"` |
| `copilot` | `copilot` | `npm i -g @github/copilot` | `GITHUB_TOKEN` | `copilot -p "<prompt>" --allow-all-tools` |
| `kiro` | `kiro-cli` | `curl -fsSL https://cli.kiro.dev/install \| bash` | `KIRO_API_KEY` | `kiro-cli chat --v3 --no-interactive --trust-all-tools "<prompt>"` |

Adapter details (verified against each vendor's docs, 2026-10):
- **claude-code:** `--bare` skips host hooks/plugins for deterministic CI runs;
  `--allowedTools "Bash,Read,Edit"` auto-approves the tools needed to fix code.
- **codex:** `--sandbox workspace-write` (successor of `--full-auto`) lets the
  agent edit files; `--ephemeral` avoids persisting session files in the runner.
- **copilot:** `--allow-all-tools` skips approval prompts; `--deny-tool` can
  scope further. Known upstream flakiness in `-p` mode (empty output issues) —
  adapter treats non-zero exit or empty result as a failed attempt.
- **kiro:** API-key headless auth requires a Kiro Pro-tier subscription;
  `--trust-all-tools` auto-approves tool calls.

The `model` field in `.ai-ci.json` is passed through when the agent supports
it (`claude --model`, `kiro --model`); adapters without model pinning ignore it.

## 4. Retry Configuration — `.ai-ci.json`

Checked into the repo root; the dispatcher and workflow read it before the
fix loop:

```json
{
  "agent": "claude-code",
  "maxRetries": 3,
  "model": "claude-sonnet-5",
  "baseBranch": "develop"
}
```

Changing `maxRetries` **or swapping `agent`** and pushing is itself part of
the demo (config is versioned and visible). The repo README documents which
GitHub secret each agent requires.

## 5. Branch Model

- **`main`** — stable demo app. Scaffold (app + CI) lands here first;
  `develop` branches from it afterward.
- **`develop`** — AI working branch. Task implementations and gate fixes are
  pushed here.
- **PR `develop` → `main`** — gates run as a blocking check. If the AI fixes
  anything on a PR, fixes are pushed to the PR head branch, never to `main`.

## 6. Workflows

### 6.1 `demo.yml` — demo starter (`workflow_dispatch`)

Inputs:
- `mode`: `task` | `seed-bug` (default `seed-bug`)
- `taskPrompt`: free-text feature instruction (used in `task` mode)
  e.g. *"add GET /api/tasks?done=false filtering"*

Job `implement` (runs on `develop`):
- **task mode:** run `scripts/ai-agent.mjs --mode task --prompt "<taskPrompt>"`
  — whichever agent `.ai-ci.json` selects implements the feature, reading
  CLAUDE.md for conventions; the dispatcher commits + pushes to `develop`.
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

### 6.2 `quality-gate.yml` — gate + self-fix loop

Triggers:
- `push` to `develop`
- `pull_request` targeting `main`

Job `gate-and-fix` (runs on the pushed branch / PR head):

```
read .ai-ci.json → agent, maxRetries
for attempt in 0..maxRetries:
    run npm run gate (4 gates, capture output to gate-output.txt)
    if pass: exit green ✅
    if attempt == maxRetries: exit red ❌ (retries exhausted)
    scripts/ai-agent.mjs --mode fix --prompt-file gate-output.txt
      (dispatcher verifies the selected agent's secret env, runs the CLI
       with CLAUDE.md + failure logs in the prompt)
    commit "[ai-fix <agent> attempt N/M] [skip ci]" → push to same branch
```

Key wiring choices:
- **Internal loop:** gates re-run inside the same job; one Actions run shows
  the entire attempt history. No cross-workflow state passing.
- **`[skip ci]` marker** on fix commits prevents re-triggering the workflow
  on the AI's own pushes (no recursion).
- **Auth:** per-agent GitHub secrets (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
  `GITHUB_TOKEN`, `KIRO_API_KEY`) mapped to env only for the selected agent;
  the dispatcher fails fast if the required secret is absent.
- On PRs, the loop is identical; the AI pushes to the PR head branch.

## 7. Demo Flow (the story told to viewers)

1. Operator runs **Demo** workflow (Actions → Run workflow → `seed-bug`).
2. `demo.yml` injects bugs, pushes to `develop`.
3. `quality-gate.yml` fires: all 4 gates fail.
4. The configured agent reads `CLAUDE.md` + failure logs → fix commit
   (`[ai-fix claude-code attempt 1/3] [skip ci]`).
5. Gates re-run inside the same job. Repeat until green — or red after
   `maxRetries` (exhaustion is also a demo outcome).
6. `develop` commit history shows AI-authored fix commits with agent name and
   attempt numbers; the Actions log shows the full battle.
7. Swap `"agent": "codex"` in `.ai-ci.json`, seed again → a different AI
   fights the same gates. That comparison is the demo's punchline.

## 8. Out of Scope (YAGNI)

- Database, auth, Docker, deployment target
- Coverage thresholds, formatter gate, SonarCloud/CodeQL
- Issue-driven feature requests
- Multi-agent parallel comparison, cost tracking dashboards
- Fixing upstream agent-CLI bugs (e.g. Copilot `-p` empty-output flakiness);
  the adapter surfaces them as failed attempts

## 9. Success Criteria

1. Pristine scaffold on `main`/`develop` passes all 4 gates green.
2. `seed-bug` demo run: gates fail, AI fixes within `maxRetries`, final
   gate run is green, fix commits visible on `develop`.
3. `task` demo run: AI implements a small feature that passes gates
   (possibly after fix iterations).
4. Changing `maxRetries` in `.ai-ci.json` changes loop behavior on the next
   run — no workflow YAML edit required.
5. Changing `agent` in `.ai-ci.json` switches which CLI runs the fix loop
   (verified per-agent by its secret being present; absent secret fails fast
   with a clear error before any gate cycles are burned).
6. PR `develop` → `main` blocks on the gate check.
