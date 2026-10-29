# agents-ci-cd — AI Self-Healing CI/CD Demo

A TypeScript + Express (MVC) Web API whose quality gates are enforced by
GitHub Actions. When a gate fails, an **AI coding agent fixes the code and
pushes a fix commit** — in a bounded retry loop you configure in the repo.
Any of four agents can do the fixing; you pick with one line of config.

## The pieces

| Piece | Where | What it does |
|---|---|---|
| Web API | `src/` | Tasks CRUD, Express MVC, in-memory model |
| Quality gates | `npm run gate` | typecheck · lint conventions · lint anti-patterns · tests (aggregated report) |
| Gate runner | `scripts/run-gates.mjs` | runs all 4 gates, one combined report |
| Bug seeder | `scripts/seed-bugs.mjs` | injects one deterministic bug per gate |
| Agent dispatcher | `scripts/ai-agent.mjs` | runs the agent named in `.ai-ci.json` |
| Fix loop | `scripts/gate-and-fix.sh` | gate → AI fix → commit `[skip ci]` → push → repeat |
| Demo workflow | `.github/workflows/demo.yml` | manual trigger: seed-bug or task mode |
| Gate workflow | `.github/workflows/quality-gate.yml` | runs on push to develop / PRs to main |
| Agent rulebook | `AGENTS.md` | conventions every agent must follow |

## Setup (once)

1. Branches: `main` (stable) and `develop` (AI working branch) must both exist.
2. Add the GitHub repo secret for each agent you want to demo:

   | Agent (`.ai-ci.json` `"agent"`) | Secret to add |
   |---|---|
   | `claude-code` | `ANTHROPIC_API_KEY` |
   | `codex` | `OPENAI_API_KEY` |
   | `copilot` | `GITHUB_TOKEN` is automatic — needs a Copilot seat |
   | `kiro` | `KIRO_API_KEY` (Kiro Pro-tier API key) |

   All four secrets are mapped into the workflows; only the selected
   agent's key is required. Missing keys fail fast with a clear error.
3. (Optional, for the PR part of the demo) Branch protection on `main`:
   Settings → Branches → add rule requiring the **Gates + AI self-fix loop**
   check. Then a `develop` → `main` PR blocks until the gate passes.

## Running the demo

1. GitHub → **Actions** → **Demo** → **Run workflow**
   - `seed-bug` mode: injects 4 deterministic bugs (one per gate) into
     `develop`, then the loop fights them.
   - `task` mode: the AI implements your `taskPrompt` on `develop`, then
     the gates check it (and the loop fixes any failures).
2. Watch one workflow run: gate run 1 fails all 4 gates → the agent reads
   `AGENTS.md` + the aggregated report → fix commit
   `[ai-fix <agent> attempt 1/3] [skip ci]` → gate run 2 … until green
   (or red when retries run out — also part of the demo).
3. `git log develop` shows the AI-authored fix commits.

## Swapping the agent

`.ai-ci.json`:

```json
{ "agent": "claude-code", "maxRetries": 3, "model": "claude-sonnet-5", "baseBranch": "develop" }
```

Change `"agent"` to `codex`, `copilot`, or `kiro`, commit, seed again — a
different AI fights the same gates. `maxRetries` bounds the fix attempts
without touching workflow YAML. (`model` is passed to claude-code only.)

## Re-running the seed demo

The seeder can refuse to run for two reasons: `Already seeded` (a previous
seed was never fixed) or `Anchor not found` (the AI's fix changed an anchor
line — after a green demo this is the usual blocker, since the fixes removed
the seeded bugs). Both exits mean the same thing: reset the app code from
`main` before re-seeding:

```bash
git checkout develop
git checkout main -- src tests
git commit -m "chore(demo): reset app code for re-seed"
git push
```

Note: this restores tracked paths but does NOT delete files a task-mode
agent added on `develop` (e.g. a new controller). Remove those manually if
a task demo leaves something behind.

## Why the loop pushes with `[skip ci]`

Fix commits are pushed by the workflow's own `GITHUB_TOKEN`. GitHub never
re-triggers workflows from `GITHUB_TOKEN` pushes, so the loop can't recurse;
the `[skip ci]` marker documents that intent and also protects if you ever
switch to a PAT.

## Local commands

```bash
npm run gate   # all four gates, aggregated report
npm test       # vitest only
npm start      # boot the API on :3000
node scripts/seed-bugs.mjs   # seed demo bugs (fails fast if already seeded)
```
