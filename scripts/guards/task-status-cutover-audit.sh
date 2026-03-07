#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

FAILED=0

print_header() {
  echo
  echo "============================================================"
  echo "$1"
  echo "============================================================"
}

print_ok() {
  echo "[PASS] $1"
}

print_fail() {
  echo "[FAIL] $1"
}

run_zero_match_check() {
  local title="$1"
  local pattern="$2"
  shift 2
  local paths=("$@")
  local output
  output="$(git grep -n -E "$pattern" -- "${paths[@]}" || true)"
  if [[ -z "$output" ]]; then
    print_ok "$title"
  else
    print_fail "$title"
    echo "$output"
    FAILED=1
  fi
}

run_usetasktargetstates_check() {
  local title="useTaskTargetStates 仅允许在 useProjectAssets/useGlobalAssets 中使用"
  local output
  output="$(git grep -n "useTaskTargetStates" -- src || true)"

  if [[ -z "$output" ]]; then
    print_ok "$title (当前 0 命中)"
    return
  fi

  local filtered
  filtered="$(echo "$output" | grep -v "src/lib/query/hooks/useProjectAssets.ts" | grep -v "src/lib/query/hooks/useGlobalAssets.ts" || true)"

  if [[ -z "$filtered" ]]; then
    print_ok "$title"
  else
    print_fail "$title"
    echo "$filtered"
    FAILED=1
  fi
}

print_header "Task Status Cutover Audit"

run_zero_match_check \
  "禁止 useTaskHandoff" \
  "useTaskHandoff" \
  src

run_zero_match_check \
  "禁止 manualRegeneratingItems/setRegeneratingItems/clearRegeneratingItem" \
  "manualRegeneratingItems|setRegeneratingItems|clearRegeneratingItem" \
  src

run_zero_match_check \
  "禁止业务层直接判断 status ===/!== cancelled" \
  "status\\s*===\\s*['\\\"]cancelled['\\\"]|status\\s*!==\\s*['\\\"]cancelled['\\\"]" \
  src

run_zero_match_check \
  "禁止 generatingImage/generatingVideo/generatingLipSync 字段" \
  "\\bgeneratingImage\\b|\\bgeneratingVideo\\b|\\bgeneratingLipSync\\b" \
  src

run_usetasktargetstates_check

run_zero_match_check \
  "禁止 novel-promotion/asset-hub/shared-assets 中 useState(false) 作为生成态命名" \
  "const \\[[^\\]]*(Generating|Regenerating|WaitingForGeneration|AnalyzingAssets|GeneratingAll|CopyingFromGlobal)[^\\]]*\\]\\s*=\\s*useState\\(false\\)" \
  "src/app/[locale]/workspace/[projectId]/modes/novel-promotion" \
  "src/app/[locale]/workspace/asset-hub" \
  "src/components/shared/assets"

print_header "Audit Result"
if [[ "$FAILED" -eq 0 ]]; then
  echo "All checks passed."
  exit 0
fi

echo "Audit failed. Please fix findings above."
exit 1
