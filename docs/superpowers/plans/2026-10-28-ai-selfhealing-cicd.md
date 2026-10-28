# AI Self-Healing CI/CD Demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Express + TypeScript MVC Web API demo where GitHub Actions runs 4 quality gates and a pluggable AI coding agent (Claude Code / Codex / Copilot / Kiro) self-fixes failures in a bounded, config-driven retry loop.

**Architecture:** The app is a small Tasks CRUD API (MVC, in-memory model). `npm run gate` (via `scripts/run-gates.mjs`) aggregates 4 checks. `scripts/ai-agent.mjs` dispatches to the agent named in `.ai-ci.json` (fix mode or task mode). `scripts/gate-and-fix.sh` implements the loop: gate → on failure run agent → commit `[skip ci]` → push → re-gate, up to `maxRetries`. Two workflows: `demo.yml` (seed-bug / task dispatch + loop) and `quality-gate.yml` (push to develop / PRs to main + loop). Rules for agents live in `AGENTS.md`.

**Tech Stack:** Node 20, npm, TypeScript 5 (strict), Express 4, Vitest + supertest, ESLint 9 flat configs + typescript-eslint, GitHub Actions.

**Working directory:** repo root `C:\Working\FY26\Personal\agents-ci-cd` (Windows, Git Bash). Commands below are POSIX (Git Bash). CI runs Ubuntu.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "agents-ci-cd",
  "version": "0.1.0",
  "private": true,
  "description": "Demo: AI agents self-fix quality-gate failures in GitHub Actions",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint:conventions": "eslint . --config eslint.config.conventions.mjs --max-warnings 0",
    "lint:antipattern": "eslint . --config eslint.config.antipattern.mjs --max-warnings 0",
    "test": "vitest run",
    "gate": "node scripts/run-gates.mjs",
    "start": "tsx src/server.ts"
  }
}
```

Note: the `lint:*` scripts reference config files created in Tasks 5–6 and `gate` references a script created in Task 7 — they will not work until then. That is expected.

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
gate-output.txt
dist/
```

- [ ] **Step 5: Install dependencies**

```bash
npm install express@^4.21.2
npm install -D typescript@^5.6.0 @types/node@^22.0.0 @types/express@^4.17.21 vitest@^3.0.0 supertest@^7.0.0 @types/supertest@^6.0.0 eslint@^9.0.0 typescript-eslint@^8.0.0 tsx@^4.0.0
```

Expected: `npm ls express typescript vitest eslint typescript-eslint` prints versions with no `UNMET` lines.

- [ ] **Step 6: Verify toolchain boots**

```bash
npx tsc --version && npx vitest --version
```

Expected: TypeScript 5.x version, Vitest 3.x version. No test files exist yet — do NOT run `npx vitest run` (it errors on empty suite).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore
git commit -m "chore: scaffold TypeScript + Express + Vitest project"
```

---

### Task 2: Task model (TDD)

**Files:**
- Create: `tests/task.model.test.ts`
- Create: `src/models/task.model.ts`

- [ ] **Step 1: Write the failing model tests**

Create `tests/task.model.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { taskRepository } from '../src/models/task.model';

describe('taskRepository', () => {
  beforeEach(() => {
    taskRepository.reset();
  });

  it('creates tasks with sequential string ids and done=false', () => {
    const first = taskRepository.create({ title: 'First' });
    const second = taskRepository.create({ title: 'Second' });

    expect(first.id).toBe('1');
    expect(first.title).toBe('First');
    expect(first.done).toBe(false);
    expect(second.id).toBe('2');
  });

  it('returns copies — mutating results does not corrupt the store', () => {
    const created = taskRepository.create({ title: 'Original' });
    created.title = 'Mutated';
    expect(taskRepository.findById(created.id)?.title).toBe('Original');
  });

  it('findById returns undefined for unknown id', () => {
    expect(taskRepository.findById('999')).toBeUndefined();
  });

  it('update mutates only the provided fields', () => {
    const created = taskRepository.create({ title: 'Before' });
    const updated = taskRepository.update(created.id, { done: true });

    expect(updated?.title).toBe('Before');
    expect(updated?.done).toBe(true);

    const renamed = taskRepository.update(created.id, { title: 'After' });
    expect(renamed?.title).toBe('After');
    expect(renamed?.done).toBe(true);
  });

  it('update returns undefined for unknown id', () => {
    expect(taskRepository.update('999', { done: true })).toBeUndefined();
  });

  it('delete removes a task and reports true; unknown id reports false', () => {
    const created = taskRepository.create({ title: 'Bye' });
    expect(taskRepository.delete(created.id)).toBe(true);
    expect(taskRepository.all()).toHaveLength(0);
    expect(taskRepository.delete('999')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/task.model.test.ts
```

Expected: FAIL — cannot resolve import `../src/models/task.model`.

- [ ] **Step 3: Implement `src/models/task.model.ts`**

```ts
export interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

export interface CreateTaskInput {
  title: string;
}

export interface UpdateTaskInput {
  title?: string;
  done?: boolean;
}

class TaskRepository {
  private tasks: Task[] = [];
  private nextId = 1;

  all(): Task[] {
    return this.tasks.map((task) => ({ ...task }));
  }

  findById(id: string): Task | undefined {
    const task = this.tasks.find((candidate) => candidate.id === id);
    return task ? { ...task } : undefined;
  }

  create(input: CreateTaskInput): Task {
    const task: Task = {
      id: String(this.nextId),
      title: input.title,
      done: false,
      createdAt: new Date().toISOString(),
    };
    this.nextId += 1;
    this.tasks.push(task);
    return { ...task };
  }

  update(id: string, input: UpdateTaskInput): Task | undefined {
    const task = this.tasks.find((candidate) => candidate.id === id);
    if (!task) {
      return undefined;
    }
    if (input.title !== undefined) {
      task.title = input.title;
    }
    if (input.done !== undefined) {
      task.done = input.done;
    }
    return { ...task };
  }

  delete(id: string): boolean {
    const index = this.tasks.findIndex((candidate) => candidate.id === id);
    if (index === -1) {
      return false;
    }
    this.tasks.splice(index, 1);
    return true;
  }

  reset(): void {
    this.tasks = [];
    this.nextId = 1;
  }
}

export const taskRepository = new TaskRepository();
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/task.model.test.ts
```

Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/task.model.test.ts src/models/task.model.ts
git commit -m "feat: add in-memory task model with repository"
```

---

### Task 3: HTTP layer — middleware, controller, routes, app (TDD)

**Files:**
- Create: `tests/tasks.api.test.ts`
- Create: `src/middleware/not-found.ts`
- Create: `src/middleware/error-handler.ts`
- Create: `src/controllers/task.controller.ts`
- Create: `src/routes/task.routes.ts`
- Create: `src/app.ts`

- [ ] **Step 1: Write the failing API tests**

Create `tests/tasks.api.test.ts`:

```ts
import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/app';
import { taskRepository } from '../src/models/task.model';

describe('Tasks API', () => {
  beforeEach(() => {
    taskRepository.reset();
  });

  describe('POST /api/tasks', () => {
    it('creates a task and returns 201', async () => {
      const res = await request(app).post('/api/tasks').send({ title: 'Write demo' });
      expect(res.status).toBe(201);
      expect(res.body.task.title).toBe('Write demo');
      expect(res.body.task.done).toBe(false);
    });

    it('rejects an empty title with 400', async () => {
      const res = await request(app).post('/api/tasks').send({ title: '' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('rejects a missing title with 400', async () => {
      const res = await request(app).post('/api/tasks').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/tasks', () => {
    it('returns all tasks', async () => {
      taskRepository.create({ title: 'First' });
      taskRepository.create({ title: 'Second' });
      const res = await request(app).get('/api/tasks');
      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(2);
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('returns a task by id', async () => {
      const created = taskRepository.create({ title: 'Find me' });
      const res = await request(app).get(`/api/tasks/${created.id}`);
      expect(res.status).toBe(200);
      expect(res.body.task.id).toBe(created.id);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app).get('/api/tasks/999');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('PUT /api/tasks/:id', () => {
    it('updates title and done', async () => {
      const created = taskRepository.create({ title: 'Before' });
      const res = await request(app)
        .put(`/api/tasks/${created.id}`)
        .send({ title: 'After', done: true });
      expect(res.status).toBe(200);
      expect(res.body.task.title).toBe('After');
      expect(res.body.task.done).toBe(true);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app).put('/api/tasks/999').send({ title: 'x' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('deletes a task and returns 204', async () => {
      const created = taskRepository.create({ title: 'Bye' });
      const res = await request(app).delete(`/api/tasks/${created.id}`);
      expect(res.status).toBe(204);
      expect(taskRepository.all()).toHaveLength(0);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app).delete('/api/tasks/999');
      expect(res.status).toBe(404);
    });
  });

  describe('unknown routes', () => {
    it('returns 404 with an error body', async () => {
      const res = await request(app).get('/api/nope');
      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/tasks.api.test.ts
```

Expected: FAIL — cannot resolve `../src/app`.

- [ ] **Step 3: Implement middleware**

Create `src/middleware/not-found.ts`:

```ts
import type { Request, Response } from 'express';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Route not found' });
}
```

Create `src/middleware/error-handler.ts`:

```ts
import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
};
```

- [ ] **Step 4: Implement the controller**

Create `src/controllers/task.controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { CreateTaskInput, UpdateTaskInput } from '../models/task.model';
import { taskRepository } from '../models/task.model';

export function listTasks(_req: Request, res: Response): void {
  res.status(200).json({ tasks: taskRepository.all() });
}

export function getTask(req: Request, res: Response): void {
  const task = taskRepository.findById(req.params.id);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.status(200).json({ task });
}

export function createTask(req: Request, res: Response): void {
  const { title } = (req.body ?? {}) as CreateTaskInput;
  if (typeof title !== 'string' || title.trim().length === 0) {
    res.status(400).json({ error: 'title is required and must be a non-empty string' });
    return;
  }
  const created = taskRepository.create({ title });
  res.status(201).json({ task: created });
}

export function updateTask(req: Request, res: Response): void {
  const input = (req.body ?? {}) as UpdateTaskInput;
  const updated = taskRepository.update(req.params.id, input);
  if (!updated) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.status(200).json({ task: updated });
}

export function deleteTask(req: Request, res: Response): void {
  const deleted = taskRepository.delete(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.status(204).send();
}
```

- [ ] **Step 5: Implement routes and app**

Create `src/routes/task.routes.ts`:

```ts
import { Router } from 'express';
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
} from '../controllers/task.controller';

export const taskRoutes = Router();

taskRoutes.get('/', listTasks);
taskRoutes.get('/:id', getTask);
taskRoutes.post('/', createTask);
taskRoutes.put('/:id', updateTask);
taskRoutes.delete('/:id', deleteTask);

export default taskRoutes;
```

Create `src/app.ts`:

```ts
import express from 'express';
import taskRoutes from './routes/task.routes';
import { notFoundHandler } from './middleware/not-found';
import { errorHandler } from './middleware/error-handler';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', taskRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export const app = createApp();
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run
```

Expected: PASS — 6 model tests + 13 API tests, all green.

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: no output, exit 0.

- [ ] **Step 8: Commit**

```bash
git add tests/tasks.api.test.ts src/
git commit -m "feat: add Tasks API (controller, routes, middleware, app)"
```

---

### Task 4: Server entrypoint

**Files:**
- Create: `src/server.ts`

- [ ] **Step 1: Write `src/server.ts`**

```ts
import { createApp } from './app';

const port = Number(process.env.PORT ?? 3000);

const server = createApp().listen(port, () => {
  console.log(`Task API listening on port ${port}`);
});

export default server;
```

- [ ] **Step 2: Verify it boots**

```bash
npm start &
sleep 2
curl -s -X POST http://localhost:3000/api/tasks -H "Content-Type: application/json" -d '{"title":"smoke"}'
curl -s http://localhost:3000/api/tasks
kill %1
```

Expected: POST returns `{"task":{"id":"1",...}}`; GET returns the list. (`kill %1` stops the server; on failure use `npx kill-port 3000` or close the shell job.)

- [ ] **Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat: add server entrypoint"
```

---

### Task 5: Conventions gate (ESLint config #1)

**Files:**
- Create: `eslint.config.conventions.mjs`

- [ ] **Step 1: Write `eslint.config.conventions.mjs`**

```js
import tseslint from 'typescript-eslint';

// Gate 2 — coding conventions: how the code is written.
export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'scripts/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
```

- [ ] **Step 2: Verify it passes on clean code**

```bash
npm run lint:conventions
```

Expected: no output, exit 0.

- [ ] **Step 3: Negative check — verify it catches a violation**

```bash
printf 'export const seededConventionBug = 1;\n' > src/models/seed-bug.ts
npm run lint:conventions
```

Expected: FAIL — `@typescript-eslint/no-unused-vars` on `seededConventionBug`.

- [ ] **Step 4: Remove the violation and re-verify**

```bash
rm src/models/seed-bug.ts
npm run lint:conventions
```

Expected: pass, exit 0.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.conventions.mjs
git commit -m "feat: add conventions quality gate (eslint config 1)"
```

---

### Task 6: Anti-pattern gate (ESLint config #2)

**Files:**
- Create: `eslint.config.antipattern.mjs`

- [ ] **Step 1: Write `eslint.config.antipattern.mjs`**

```js
import tseslint from 'typescript-eslint';

// Gate 3 — anti-patterns: what must never appear in the code.
// Magic numbers are only enforced in src/ (tests assert on counts/ids freely).
// server.ts may log at startup — it is the infra entrypoint.
export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'scripts/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-console': 'error',
      'no-eval': 'error',
      'no-magic-numbers': [
        'error',
        { ignore: [-1, 0, 1, 3000, 200, 201, 204, 400, 404, 500] },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/require-await': 'error',
    },
  },
  {
    files: ['src/server.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-console': 'error',
      'no-eval': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/require-await': 'error',
    },
  },
);
```

The `ignore` list documents the whitelisted numbers: array splice/length primitives, the default port, and HTTP status codes used by the API.

- [ ] **Step 2: Verify it passes on clean code**

```bash
npm run lint:antipattern
```

Expected: no output, exit 0.

- [ ] **Step 3: Negative check — verify it catches violations**

```bash
printf 'export function seedBug(data: any): any {\n  console.log("debug", data);\n  return eval("1 + 86400");\n}\n' > src/models/seed-bug.ts
npm run lint:antipattern
```

Expected: FAIL — reports `no-explicit-any`, `no-console`, `no-eval`, and `no-magic-numbers` (86400).

- [ ] **Step 4: Remove the violation and re-verify**

```bash
rm src/models/seed-bug.ts
npm run lint:antipattern
```

Expected: pass, exit 0.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.antipattern.mjs
git commit -m "feat: add anti-pattern quality gate (eslint config 2)"
```

---

### Task 7: Gate runner — aggregate all four gates

**Files:**
- Create: `scripts/run-gates.mjs`

- [ ] **Step 1: Write `scripts/run-gates.mjs`**

```js
#!/usr/bin/env node
// Runs every quality gate unconditionally and aggregates the output.
// Exit code is non-zero if any gate failed, so the AI agent sees ALL
// violations in one prompt instead of one per retry.
import { spawnSync } from 'node:child_process';

const GATES = [
  { name: 'typecheck', script: 'typecheck' },
  { name: 'lint:conventions', script: 'lint:conventions' },
  { name: 'lint:antipattern', script: 'lint:antipattern' },
  { name: 'test', script: 'test' },
];

const isWindows = process.platform === 'win32';
const failed = [];

for (const gate of GATES) {
  console.log(`\n=== gate: ${gate.name} ===`);
  const result = spawnSync('npm', ['run', '--silent', gate.script], {
    encoding: 'utf8',
    shell: isWindows,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (output) {
    console.log(output);
  }
  if (result.status !== 0) {
    failed.push(gate.name);
    console.log(`FAILED gate: ${gate.name}`);
  } else {
    console.log(`PASSED gate: ${gate.name}`);
  }
}

if (failed.length > 0) {
  console.error(`\nGate summary: FAILED (${failed.join(', ')})`);
  process.exit(1);
}
console.log('\nGate summary: ALL PASSED');
```

- [ ] **Step 2: Verify the umbrella gate passes on clean code**

```bash
npm run gate
```

Expected output ends with `Gate summary: ALL PASSED`, exit 0. All 4 gates listed as PASSED.

- [ ] **Step 3: Negative check — one broken file trips the report**

```bash
printf 'export function seedBug(data: any): any {\n  return data;\n}\n' > src/models/seed-bug.ts
npm run gate > /dev/null 2>&1; echo "exit=$?"
rm src/models/seed-bug.ts
```

Expected: `exit=1`. (The full report names `lint:antipattern` as the failed gate.)

- [ ] **Step 4: Commit**

```bash
git add scripts/run-gates.mjs
git commit -m "feat: add gate runner aggregating all quality gates"
```

---

### Task 8: AGENTS.md rulebook + CLAUDE.md pointer

**Files:**
- Create: `AGENTS.md`
- Create: `CLAUDE.md`

- [ ] **Step 1: Write `AGENTS.md`**

```markdown
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
```

- [ ] **Step 2: Write `CLAUDE.md`**

```markdown
@AGENTS.md

AGENTS.md is the single rulebook for all AI agents in this repository.
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md CLAUDE.md
git commit -m "docs: add AI agent rulebook (AGENTS.md) and CLAUDE.md pointer"
```

---

### Task 9: `.ai-ci.json` — configurable agent + retries

**Files:**
- Create: `.ai-ci.json`

- [ ] **Step 1: Write `.ai-ci.json`**

```json
{
  "agent": "claude-code",
  "maxRetries": 3,
  "model": "claude-sonnet-5",
  "baseBranch": "develop"
}
```

- [ ] **Step 2: Commit**

```bash
git add .ai-ci.json
git commit -m "feat: add configurable AI CI settings (.ai-ci.json)"
```

---

### Task 10: Agent dispatcher — `scripts/ai-agent.mjs`

**Files:**
- Create: `scripts/ai-agent.mjs`

Adapter invocation facts (verified against vendor docs, 2026-10):
- claude-code: `claude --bare -p "<prompt>" --allowedTools "Bash,Read,Edit" [--model <id>]`, env `ANTHROPIC_API_KEY`
- codex: `codex exec --sandbox workspace-write --skip-git-repo-check --ephemeral "<prompt>"`, env `OPENAI_API_KEY`
- copilot: `copilot -p "<prompt>" --allow-all-tools`, env `GITHUB_TOKEN`
- kiro: `kiro-cli chat --v3 --no-interactive --trust-all-tools "<prompt>"`, env `KIRO_API_KEY`

- [ ] **Step 1: Write `scripts/ai-agent.mjs`**

```js
#!/usr/bin/env node
// Agent-agnostic AI dispatcher. Runs the coding agent selected in
// .ai-ci.json in one of two modes:
//   fix  — repair quality-gate failures listed in a prompt file
//   task — implement a feature described by a prompt string
// Adding an agent = one new registry entry below.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function argValue(flag) {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

const mode = argValue('--mode');
const promptFile = argValue('--prompt-file');
const taskPrompt = argValue('--prompt');

if (mode !== 'fix' && mode !== 'task') {
  console.error('usage: ai-agent.mjs --mode fix|task [--prompt-file <file> | --prompt <text>]');
  process.exit(2);
}

const config = JSON.parse(readFileSync('.ai-ci.json', 'utf8'));

const RULES_PREAMBLE = [
  'You are an autonomous coding agent working in a git repository.',
  '1. Read AGENTS.md at the repository root first. It defines the project conventions you MUST follow.',
  '2. Complete the task below with the smallest correct changes.',
  '   Never disable or weaken the quality gates (tsconfig, eslint configs, tests).',
  '3. Run `npm run gate` and make sure it passes before you finish.',
].join('\n');

let prompt;
if (mode === 'fix') {
  if (!promptFile) {
    console.error('--prompt-file is required in fix mode');
    process.exit(2);
  }
  const gateOutput = readFileSync(promptFile, 'utf8');
  prompt = `${RULES_PREAMBLE}\n\nTask: fix every quality-gate violation reported below.\n\nQuality gate output:\n${gateOutput}`;
} else if (!taskPrompt) {
  console.error('--prompt is required in task mode');
  process.exit(2);
} else {
  prompt = `${RULES_PREAMBLE}\n\nTask: ${taskPrompt}`;
}

const adapters = {
  'claude-code': {
    bin: 'claude',
    install: 'npm install -g @anthropic-ai/claude-code',
    envKeys: ['ANTHROPIC_API_KEY'],
    buildArgs: (p, model) => [
      '--bare', '-p', p,
      '--allowedTools', 'Bash,Read,Edit',
      ...(model ? ['--model', model] : []),
    ],
  },
  codex: {
    bin: 'codex',
    install: 'npm install -g @openai/codex',
    envKeys: ['OPENAI_API_KEY'],
    buildArgs: (p) => [
      'exec', '--sandbox', 'workspace-write',
      '--skip-git-repo-check', '--ephemeral', p,
    ],
  },
  copilot: {
    bin: 'copilot',
    install: 'npm install -g @github/copilot',
    envKeys: ['GITHUB_TOKEN'],
    buildArgs: (p) => ['-p', p, '--allow-all-tools'],
  },
  kiro: {
    bin: 'kiro-cli',
    install: 'curl -fsSL https://cli.kiro.dev/install | bash',
    envKeys: ['KIRO_API_KEY'],
    buildArgs: (p) => ['chat', '--v3', '--no-interactive', '--trust-all-tools', p],
  },
};

const adapter = adapters[config.agent];
if (!adapter) {
  console.error(`Unknown agent "${config.agent}". Known agents: ${Object.keys(adapters).join(', ')}`);
  process.exit(2);
}

const missingEnv = adapter.envKeys.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(
    `Agent "${config.agent}" requires env var(s) ${missingEnv.join(', ')} ` +
    '(map the matching GitHub secret into the workflow).',
  );
  process.exit(2);
}

const isWindows = process.platform === 'win32';
const found = spawnSync('bash', ['-c', `command -v ${adapter.bin}`], { encoding: 'utf8' });
if (found.status !== 0) {
  console.log(`Agent CLI not found — installing: ${adapter.install}`);
  const install = spawnSync('bash', ['-c', adapter.install], { stdio: 'inherit' });
  if (install.status !== 0) {
    console.error(`Failed to install the "${config.agent}" CLI`);
    process.exit(2);
  }
}

console.log(`Running agent "${config.agent}" (mode: ${mode})...`);
const run = spawnSync(adapter.bin, adapter.buildArgs(prompt, config.model), {
  stdio: 'inherit',
  shell: isWindows,
});

if (run.status !== 0) {
  console.error(`Agent "${config.agent}" exited with status ${run.status}`);
  process.exit(run.status ?? 1);
}
console.log(`Agent "${config.agent}" finished successfully.`);
```

- [ ] **Step 2: Verify CLI guards**

```bash
node scripts/ai-agent.mjs; echo "exit=$?"
node scripts/ai-agent.mjs --mode fix; echo "exit=$?"
node scripts/ai-agent.mjs --mode task; echo "exit=$?"
node scripts/ai-agent.mjs --mode fix --prompt-file package.json 2>&1 | head -1
```

Expected: first three exit `2` with usage/validation errors; fourth fails on the missing `ANTHROPIC_API_KEY` env var (name the agent's env var) — proving the fail-fast guard.

- [ ] **Step 3: Verify unknown-agent guard**

```bash
cp .ai-ci.json .ai-ci.bak.json
node -e "require('fs').writeFileSync('.ai-ci.json', JSON.stringify({ agent: 'nope' }))"
node scripts/ai-agent.mjs --mode task --prompt x; echo "exit=$?"
mv .ai-ci.bak.json .ai-ci.json
```

Expected: error message listing known agents (`claude-code, codex, copilot, kiro`), exit `2`, and `.ai-ci.json` restored.

- [ ] **Step 4: Commit**

```bash
git add scripts/ai-agent.mjs
git commit -m "feat: add agent-agnostic AI dispatcher (claude/codex/copilot/kiro)"
```

---

### Task 11: Bug seeder — `scripts/seed-bugs.mjs`

**Files:**
- Create: `scripts/seed-bugs.mjs`

Each seed targets one gate. Anchor strings must match the source EXACTLY (Task 2/3 code). The script is idempotency-guarded: it fails fast if a patch is already applied or an anchor has drifted.

- [ ] **Step 1: Write `scripts/seed-bugs.mjs`**

```js
#!/usr/bin/env node
// Deterministically injects one violation per quality gate so the self-fix
// loop can be demoed on demand. Fails fast if already seeded or if the
// source anchors have drifted (e.g. reset develop from main before re-seeding).
import { readFileSync, writeFileSync } from 'node:fs';

const injections = [
  {
    gate: 'typecheck',
    file: 'src/controllers/task.controller.ts',
    from: '  const created = taskRepository.create({ title });',
    to: '  const created = taskRepository.create({ title: 42 });',
  },
  {
    gate: 'lint:conventions',
    file: 'src/controllers/task.controller.ts',
    from: 'export function createTask(req: Request, res: Response): void {',
    to: 'export function createTask(req: Request, res: Response): void {\n  const seededUnusedVariable = "never read anywhere";',
  },
  {
    gate: 'lint:antipattern',
    file: 'src/controllers/task.controller.ts',
    from: '  res.status(201).json({ task: created });',
    to: [
      '  res.status(201).json({ task: created });',
      '  const seededDebug: any = created;',
      "  console.log('seeded debug output', seededDebug);",
      '  if (created.title.length > 86400) {',
      "    res.status(400).json({ error: 'impossible branch' });",
      '  }',
    ].join('\n'),
  },
  {
    gate: 'test',
    file: 'tests/tasks.api.test.ts',
    from: '      expect(res.status).toBe(201);',
    to: '      expect(res.status).toBe(200);',
  },
];

for (const injection of injections) {
  const source = readFileSync(injection.file, 'utf8');
  if (source.includes(injection.to)) {
    console.error(`Already seeded: ${injection.gate} (${injection.file}). Reset the branch first.`);
    process.exit(1);
  }
  if (!source.includes(injection.from)) {
    console.error(`Anchor not found for ${injection.gate} in ${injection.file} — source has drifted. Reset the branch from a clean state.`);
    process.exit(1);
  }
  writeFileSync(injection.file, source.replace(injection.from, injection.to));
  console.log(`Seeded bug for gate: ${injection.gate} (${injection.file})`);
}
console.log('All bugs seeded. `npm run gate` should now report 4 failed gates.');
```

- [ ] **Step 2: Verify seeding trips all gates**

```bash
node scripts/seed-bugs.mjs
npm run gate > /dev/null 2>&1; echo "exit=$?"
```

Expected: seeder prints 4 "Seeded bug" lines; gate exits `1`. Run `npm run gate 2>&1 | grep FAILED` — expect FAILED lines for `typecheck`, `lint:conventions`, `lint:antipattern`, and `test`.

- [ ] **Step 3: Verify the idempotency guard**

```bash
node scripts/seed-bugs.mjs; echo "exit=$?"
```

Expected: FAIL with `Already seeded`, exit `1`.

- [ ] **Step 4: Revert and confirm green again**

```bash
git checkout -- src/controllers/task.controller.ts tests/tasks.api.test.ts
npm run gate
```

Expected: `Gate summary: ALL PASSED`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-bugs.mjs
git commit -m "feat: add deterministic bug seeder for self-fix demos"
```

---

### Task 12: Fix loop — `scripts/gate-and-fix.sh`

**Files:**
- Create: `scripts/gate-and-fix.sh`

- [ ] **Step 1: Write `scripts/gate-and-fix.sh`**

```bash
#!/usr/bin/env bash
# Quality gate + AI self-fix loop.
# Usage: bash scripts/gate-and-fix.sh <agent-id> <max-retries>
# Environment (set by the workflow): the selected agent's API-key env var.
# On PR events GITHUB_HEAD_REF is the PR head branch; on push events
# GITHUB_REF_NAME is the pushed branch.
set -uo pipefail

AGENT="${1:?usage: gate-and-fix.sh <agent-id> <max-retries>}"
MAX_RETRIES="${2:?usage: gate-and-fix.sh <agent-id> <max-retries>}"
BRANCH="${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-$(git branch --show-current)}}"
TOTAL=$((MAX_RETRIES + 1))
ATTEMPT=0

if [ -z "$BRANCH" ]; then
  echo "ERROR: could not determine the target branch" >&2
  exit 2
fi

git config user.name "ai-fix-bot"
git config user.email "ai-fix-bot@users.noreply.github.com"

while :; do
  RUN=$((ATTEMPT + 1))
  echo ""
  echo "=============================================="
  echo " Gate run ${RUN}/${TOTAL} (agent: ${AGENT})"
  echo "=============================================="

  if node scripts/run-gates.mjs > gate-output.txt 2>&1; then
    echo ""
    echo "ALL GATES PASSED on run ${RUN}/${TOTAL} (fix attempts used: ${ATTEMPT}/${MAX_RETRIES})"
    exit 0
  fi

  tail -n 60 gate-output.txt

  if [ "${ATTEMPT}" -ge "${MAX_RETRIES}" ]; then
    echo ""
    echo "GATES STILL FAILING after ${ATTEMPT} fix attempt(s) — retries exhausted"
    exit 1
  fi

  FIX=$((ATTEMPT + 1))
  echo ""
  echo ">>> Asking agent '${AGENT}' to fix the failures (attempt ${FIX}/${MAX_RETRIES})"
  if ! node scripts/ai-agent.mjs --mode fix --prompt-file gate-output.txt; then
    echo "ERROR: agent invocation failed on attempt ${FIX}" >&2
    exit 1
  fi

  if git diff --quiet && [ ! -n "$(git ls-files --others --exclude-standard)" ]; then
    echo "ERROR: agent made no changes on attempt ${FIX} — aborting" >&2
    exit 1
  fi

  git add -A
  git commit -m "[ai-fix ${AGENT} attempt ${FIX}/${MAX_RETRIES}] [skip ci]"
  git push origin "HEAD:${BRANCH}"
  echo ">>> Fix commit pushed to ${BRANCH}; re-running gates"
  ATTEMPT=$((ATTEMPT + 1))
done
```

- [ ] **Step 2: Verify bash syntax and dry guards**

```bash
bash -n scripts/gate-and-fix.sh && echo "syntax OK"
bash scripts/gate-and-fix.sh 2>&1 | head -2
```

Expected: `syntax OK`, then a usage error (`agent id required`).

- [ ] **Step 3: Local smoke of the happy path (no AI, no push)**

Temporarily stub the agent so the loop can be exercised without an API key:

```bash
cp scripts/ai-agent.mjs scripts/ai-agent.mjs.bak
node scripts/seed-bugs.mjs
# stub: make the "agent" revert the seeded files instead of calling any CLI
node - <<'EOF'
const fs = require('fs');
let src = fs.readFileSync('scripts/ai-agent.mjs', 'utf8');
src = src.replace(
  "const found = spawnSync('bash', ['-c', `command -v ${adapter.bin}`], { encoding: 'utf8' });",
  `const found = { status: 0 };
  require('node:child_process').spawnSync('git', ['checkout', '--', 'src/controllers/task.controller.ts', 'tests/tasks.api.test.ts']);`
);
fs.writeFileSync('scripts/ai-agent.mjs', src);
EOF
git add -A && git commit -q -m "wip: temp stub for local loop test"
bash scripts/gate-and-fix.sh stub 1
mv scripts/ai-agent.mjs.bak scripts/ai-agent.mjs
git reset --hard HEAD~1
```

Expected: run 1 fails gates, "agent" (stub) reverts the files, fix commit is attempted locally (push may fail offline — acceptable in this smoke test if the loop then exits non-zero on push; on a networked machine it pushes and run 2 passes). The point of this step is to prove the loop's control flow executes. If the push fails, that still demonstrates the loop reached the commit/push stage; note it and move on.

- [ ] **Step 4: Restore and verify clean state**

```bash
git status --short
npm run gate
```

Expected: clean tree, gates ALL PASSED (AI agent script restored from `.bak`).

- [ ] **Step 5: Commit**

```bash
git add scripts/gate-and-fix.sh
git commit -m "feat: add gate-and-fix retry loop script"
```

---

### Task 13: Workflow — `quality-gate.yml`

**Files:**
- Create: `.github/workflows/quality-gate.yml`

Note the GitHub behavior this design leans on: pushes made with the default `GITHUB_TOKEN` do NOT re-trigger workflows, so the loop's internal `[skip ci]` pushes cannot recurse. The marker is kept as documentation of intent.

- [ ] **Step 1: Write `.github/workflows/quality-gate.yml`**

```yaml
name: Quality Gate

on:
  push:
    branches: [develop]
  pull_request:
    branches: [main]

permissions:
  contents: write

concurrency:
  group: quality-gate-${{ github.ref }}
  cancel-in-progress: false

jobs:
  gate-and-fix:
    name: Gates + AI self-fix loop
    runs-on: ubuntu-latest
    steps:
      - name: Checkout (PR head or pushed branch)
        uses: actions/checkout@v4
        with:
          ref: ${{ github.head_ref || github.ref_name }}
          fetch-depth: 0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Read AI config
        id: aiconfig
        run: |
          echo "agent=$(jq -r '.agent' .ai-ci.json)" >> "$GITHUB_OUTPUT"
          echo "maxRetries=$(jq -r '.maxRetries' .ai-ci.json)" >> "$GITHUB_OUTPUT"

      - name: Run gates with self-fix loop
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          KIRO_API_KEY: ${{ secrets.KIRO_API_KEY }}
        run: bash scripts/gate-and-fix.sh "${{ steps.aiconfig.outputs.agent }}" "${{ steps.aiconfig.outputs.maxRetries }}"
```

- [ ] **Step 2: Validate YAML locally**

```bash
node -e "const fs=require('fs');const y=require('js-yaml')" 2>/dev/null || npx --yes js-yaml .github/workflows/quality-gate.yml > /dev/null && echo "YAML OK"
```

Expected: `YAML OK` (js-yaml parses without error).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/quality-gate.yml
git commit -m "ci: add quality-gate workflow with AI self-fix loop"
```

---

### Task 14: Workflow — `demo.yml`

**Files:**
- Create: `.github/workflows/demo.yml`

Two jobs: `implement` (seed bugs or have the AI implement a task, push to `develop`), then `gate-and-fix` (the loop). The gate job lives here because pushes made with `GITHUB_TOKEN` do not re-trigger other workflows — the demo runs its own loop instead of relying on `quality-gate.yml` firing.

- [ ] **Step 1: Write `.github/workflows/demo.yml`**

```yaml
name: Demo

on:
  workflow_dispatch:
    inputs:
      mode:
        description: 'Demo mode'
        required: true
        type: choice
        default: seed-bug
        options: [seed-bug, task]
      taskPrompt:
        description: 'Feature instruction (used in task mode)'
        required: false
        type: string
        default: ''

permissions:
  contents: write

concurrency:
  group: demo-develop
  cancel-in-progress: false

jobs:
  implement:
    name: 'Mode: ${{ inputs.mode }}'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: develop
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Configure git
        run: |
          git config user.name "ai-demo-bot"
          git config user.email "ai-demo-bot@users.noreply.github.com"

      - name: Seed bugs (seed-bug mode)
        if: ${{ inputs.mode == 'seed-bug' }}
        run: |
          node scripts/seed-bugs.mjs
          git add -A
          git commit -m "chore(demo): seed bugs for self-fix demo"
          git push origin HEAD:develop

      - name: Implement task with AI (task mode)
        if: ${{ inputs.mode == 'task' }}
        env:
          TASK_PROMPT: ${{ inputs.taskPrompt }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          KIRO_API_KEY: ${{ secrets.KIRO_API_KEY }}
        run: |
          node scripts/ai-agent.mjs --mode task --prompt "$TASK_PROMPT"
          git add -A
          git commit -m "feat(ai): implement requested task"
          git push origin HEAD:develop

  gate-and-fix:
    name: Gates + AI self-fix loop
    needs: implement
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: develop
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Read AI config
        id: aiconfig
        run: |
          echo "agent=$(jq -r '.agent' .ai-ci.json)" >> "$GITHUB_OUTPUT"
          echo "maxRetries=$(jq -r '.maxRetries' .ai-ci.json)" >> "$GITHUB_OUTPUT"

      - name: Run gates with self-fix loop
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          KIRO_API_KEY: ${{ secrets.KIRO_API_KEY }}
        run: bash scripts/gate-and-fix.sh "${{ steps.aiconfig.outputs.agent }}" "${{ steps.aiconfig.outputs.maxRetries }}"
```

- [ ] **Step 2: Validate YAML locally**

```bash
npx --yes js-yaml .github/workflows/demo.yml > /dev/null && echo "YAML OK"
```

Expected: `YAML OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/demo.yml
git commit -m "ci: add demo workflow (seed-bug / task dispatch + fix loop)"
```

---

### Task 15: README — demo runbook

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
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

The seeder anchors to exact source strings. After a demo the AI's fixes are
committed on `develop`; before re-seeding, reset the app code:

```bash
git checkout main -- src tests
git commit -m "chore(demo): reset app code for re-seed"
git push
```

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
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add demo runbook (README)"
```

---

### Task 16: Push, branch `develop`, final green verification

**Files:** none (git operations only)

- [ ] **Step 1: Verify the whole gate one last time**

```bash
npm run gate && git status --short
```

Expected: `Gate summary: ALL PASSED`, clean working tree.

- [ ] **Step 2: Push main and create develop**

```bash
git push origin main
git checkout -b develop
git push -u origin develop
git checkout main
```

Expected: both branches on origin; local back on `main`.

- [ ] **Step 3: Smoke-check CI wiring (optional if secrets exist)**

If at least the selected agent's secret is set: GitHub → Actions → Demo →
Run workflow (`seed-bug`). Expected: `implement` seeds and pushes; `gate-and-fix`
run 1 fails 4 gates, agent fix commit appears on `develop`, run 2 passes —
workflow green. Without secrets, expect a fast, clear failure naming the
missing env var (that itself validates the guard).

- [ ] **Step 4: Report**

Summarize: commits pushed, branches created, gate status, and the exact
Actions steps the operator must do to run the demo (secrets + dispatch).

---

## Self-Review (completed during planning)

1. **Spec coverage** — spec §1 app (Tasks 1–4), §2 gates (Tasks 5–7), §3 adapters + §4 config (Tasks 9–10), §5 branch model (Task 16), §6 workflows (Tasks 13–14), demo flow + seed-bug (Task 11), AGENTS.md rulebook (Task 8), README (Task 15). Success criteria 1 & 6 verified by Tasks 7/16; 2–3 by Task 16 Step 3; 4–5 by `.ai-ci.json`-driven workflow inputs (Tasks 13–14 read them fresh each run).
2. **Placeholders** — none; every step carries complete code/commands and expected output.
3. **Type consistency** — `taskRepository.all/findById/create/update/delete/reset` identical across model, controller, tests, and seed anchors; controller exports match route imports; `createApp`/`app` exports match server/tests; seed `from` strings are byte-exact substrings of Task 2/3 code (2-space source indent, 6-space test indent).
```
