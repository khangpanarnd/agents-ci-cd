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
    to: '      expect(res.status).toBe(202);',
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
