#!/usr/bin/env bash
# Quality gate + AI self-fix loop.
# Usage: bash scripts/gate-and-fix.sh <agent-id> <max-retries> [branch]
# Environment (set by the workflow): the selected agent's API-key env var.
# Set AI_FIX_NO_PUSH=1 to record fix commits without pushing (local dry-run).
# Branch resolution: an explicit 3rd arg wins (needed for workflow_dispatch,
# where GITHUB_REF_NAME is the branch dispatched FROM, not the checked-out
# branch). Otherwise: PR events use GITHUB_HEAD_REF; push events use
# GITHUB_REF_NAME.
set -uo pipefail

AGENT="${1:?usage: gate-and-fix.sh <agent-id> <max-retries> [branch]}"
MAX_RETRIES="${2:?usage: gate-and-fix.sh <agent-id> <max-retries> [branch]}"
if ! [[ "${MAX_RETRIES}" =~ ^[0-9]+$ ]]; then
  echo "ERROR: max-retries must be a non-negative integer (got '${MAX_RETRIES}')" >&2
  exit 2
fi
BRANCH="${3:-${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-$(git branch --show-current)}}}"
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

  if git diff --quiet HEAD && [ -z "$(git ls-files --others --exclude-standard)" ]; then
    echo "ERROR: agent made no changes on attempt ${FIX} — aborting" >&2
    exit 1
  fi

  git status --short
  git add -A
  if ! git commit -m "[ai-fix ${AGENT} attempt ${FIX}/${MAX_RETRIES}] [skip ci]"; then
    echo "ERROR: failed to record fix commit on attempt ${FIX}" >&2
    exit 1
  fi
  if [ "${AI_FIX_NO_PUSH:-0}" != "1" ]; then
    if ! git push origin "HEAD:${BRANCH}"; then
      echo "ERROR: failed to push fix commit to ${BRANCH}" >&2
      exit 1
    fi
  else
    echo ">>> AI_FIX_NO_PUSH=1 — skipping push to ${BRANCH} (local dry-run)"
  fi
  echo ">>> Fix commit recorded for ${BRANCH}; re-running gates"
  ATTEMPT=$((ATTEMPT + 1))
done
