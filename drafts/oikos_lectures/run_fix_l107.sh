#!/bin/bash
# opus 重写 l1-07 提示词（可读图诊断）
set -uo pipefail
ROOT="/Users/brianw/projects/brian-site/brianinchrist/organicchurch/library/oikos_church"
CLAUDE="$HOME/.npm-global/bin/claude"
export CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0
unset PYTHONPATH
cd "$ROOT"
D=/Users/brianw/projects/brian-site/drafts/oikos_lectures
echo "=== START $(date '+%F %T') ==="
"$CLAUDE" -p "$(cat $D/prompt_fix_l107.md)" \
  --model claude-opus-5-5 \
  --effort xhigh \
  --allowedTools "Read,Glob,Grep" \
  --add-dir "$ROOT" \
  --add-dir "/Users/brianw/ai/models/flux/outputs" \
  --max-turns 25 \
  --output-format stream-json --verbose \
  > $D/run_fix_l107.jsonl 2> $D/run_fix_l107.err
echo "=== EXIT rc=$? $(date '+%F %T') ==="
