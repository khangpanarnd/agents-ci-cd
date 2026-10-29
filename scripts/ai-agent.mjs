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

let config;
try {
  config = JSON.parse(readFileSync('.ai-ci.json', 'utf8'));
} catch (err) {
  console.error(`Cannot read .ai-ci.json: ${err.message}. Run from the repository root.`);
  process.exit(2);
}

const RULES_PREAMBLE = [
  'You are an autonomous coding agent working in a git repository.',
  '1. Read AGENTS.md at the repository root first. It defines the project conventions you MUST follow.',
  '2. Complete the task below with the smallest correct changes.',
  '   Never disable or weaken the quality gates (tsconfig, eslint configs, tests).',
  '   Never delete function parameters to silence unused-variable errors; rename with a `_` prefix instead.',
  '   Do not run state-changing git commands (add/commit/push); the CI harness records and pushes the fix.',
  '3. Run `npm run gate` and make sure it passes before you finish.',
].join('\n');

let prompt;
if (mode === 'fix') {
  if (!promptFile) {
    console.error('--prompt-file is required in fix mode');
    process.exit(2);
  }
  let gateOutput;
  try {
    gateOutput = readFileSync(promptFile, 'utf8');
  } catch (err) {
    console.error(`Cannot read prompt file ${promptFile}: ${err.message}`);
    process.exit(2);
  }
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

const found = spawnSync('bash', ['-c', `command -v ${adapter.bin}`], { encoding: 'utf8' });
if (found.status !== 0) {
  console.log(`Agent CLI not found — installing: ${adapter.install}`);
  const install = spawnSync('bash', ['-c', adapter.install], { stdio: 'inherit' });
  if (install.status !== 0) {
    console.error(`Failed to install the "${config.agent}" CLI`);
    process.exit(2);
  }
  const refound = spawnSync('bash', ['-c', `command -v ${adapter.bin}`], { encoding: 'utf8' });
  if (refound.status !== 0) {
    console.error(
      `The "${config.agent}" CLI installed but "${adapter.bin}" is still not on PATH. ` +
      'Add its install directory to PATH and re-run.',
    );
    process.exit(2);
  }
}

console.log(`Running agent "${config.agent}" (mode: ${mode})...`);
// Run through bash with the prompt as a positional argument. This gives
// execvp-level argv quoting on Linux, and on Windows cmd.exe never sees the
// prompt: with shell:true and the prompt in argv, cmd word-splits it and
// executes metacharacters (&, |, %VAR%) — injectable via repo content.
const promptPlaceholder = '"$1"';
const commandLine = [adapter.bin, ...adapter.buildArgs(promptPlaceholder, config.model)].join(' ');
const run = spawnSync('bash', ['-c', commandLine, 'ai-agent', prompt], {
  stdio: 'inherit',
});

if (run.error) {
  console.error(`Failed to launch agent "${config.agent}": ${run.error.message}`);
  process.exit(2);
}
if (run.status !== 0) {
  console.error(`Agent "${config.agent}" exited with status ${run.status}`);
  process.exit(run.status ?? 1);
}
console.log(`Agent "${config.agent}" finished successfully.`);
