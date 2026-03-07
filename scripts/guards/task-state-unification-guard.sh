#!/usr/bin/env bash
set -euo pipefail

failed=0

check_absent() {
  local label="$1"
  local pattern="$2"
  shift 2
  local output
  output="$(git grep --untracked -nE "$pattern" -- "$@" || true)"
  if [[ -n "$output" ]]; then
    echo "$output"
    echo "::error title=${label}::${label}"
    failed=1
  fi
}

check_absent \
  "Do not branch UI status on cancelled" \
  "status[[:space:]]*===[[:space:]]*['\\\"]cancelled['\\\"]|status[[:space:]]*==[[:space:]]*['\\\"]cancelled['\\\"]" \
  src/app \
  src/components \
  src/features \
  src/lib/query

check_absent \
  "useTaskHandoff is forbidden" \
  "useTaskHandoff" \
  src

check_absent \
  "Do not use legacy task hooks in app layer" \
  "useActiveTasks\\(|useTaskStatus\\(" \
  src/app \
  src/features

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

echo "task-state-unification guard passed"
