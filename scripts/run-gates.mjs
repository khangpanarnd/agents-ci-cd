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
