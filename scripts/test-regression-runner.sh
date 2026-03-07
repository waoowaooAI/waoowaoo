#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "[regression-runner] missing command"
  exit 2
fi

LOG_FILE="$(mktemp -t regression-runner.XXXXXX.log)"

set +e
"$@" 2>&1 | tee "$LOG_FILE"
CMD_STATUS=${PIPESTATUS[0]}
set -e

if [ "$CMD_STATUS" -ne 0 ]; then
  echo
  echo "[regression-runner] regression failed, collecting diagnostics..."

  FAILED_FILES="$(grep -E '^ FAIL  ' "$LOG_FILE" | sed -E 's/^ FAIL  ([^ ]+).*/\1/' | sort -u || true)"
  if [ -z "$FAILED_FILES" ]; then
    echo "[regression-runner] no explicit FAIL file lines found in output"
  else
    echo "[regression-runner] failed files:"
    while IFS= read -r file; do
      [ -z "$file" ] && continue
      echo "  - $file"
      LAST_COMMIT="$(git log -n 1 --format='%h %ad %an %s' --date=short -- "$file" || true)"
      FIRST_COMMIT="$(git log --diff-filter=A --follow --format='%h %ad %an %s' --date=short -- "$file" | tail -n 1 || true)"
      if [ -n "$LAST_COMMIT" ]; then
        echo "    latest: $LAST_COMMIT"
      fi
      if [ -n "$FIRST_COMMIT" ]; then
        echo "    first:  $FIRST_COMMIT"
      fi
    done <<< "$FAILED_FILES"
  fi
fi

rm -f "$LOG_FILE"
exit "$CMD_STATUS"
