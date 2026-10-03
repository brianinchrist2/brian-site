#!/bin/bash
# 用 claude CLI（opus-5-5, xhigh）通读全书并修订讲座大纲
set -uo pipefail
ROOT="/Users/brianw/projects/brian-site/brianinchrist/organicchurch/library/oikos_church"
CLAUDE="$HOME/.npm-global/bin/claude"
export CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0
unset PYTHONPATH
cd "$ROOT"

echo "=== START $(date '+%F %T') ==="
"$CLAUDE" -p "$(cat lectures/_build/prompt.md)" \
  --model claude-opus-5-5 \
  --effort xhigh \
  --allowedTools "Read,Write,Edit,Glob,Grep" \
  --add-dir "$ROOT" \
  --max-turns 150 \
  --output-format stream-json \
  --verbose \
  > lectures/_build/run.jsonl 2> lectures/_build/run.err
rc=$?
echo "=== EXIT rc=$rc $(date '+%F %T') ==="
exit $rc
