#!/bin/bash
# claude CLI(opus-5-5, xhigh) 设计全四讲配图方案（产出 image_plan.json）
set -uo pipefail
ROOT="/Users/brianw/projects/brian-site/brianinchrist/organicchurch/library/oikos_church"
CLAUDE="$HOME/.npm-global/bin/claude"
export CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0
unset PYTHONPATH
cd "$ROOT"
D=/Users/brianw/projects/brian-site/drafts/oikos_lectures
echo "=== START $(date '+%F %T') ==="
"$CLAUDE" -p "$(cat $D/prompt_image_plan.md)" \
  --model claude-opus-5-5 \
  --effort xhigh \
  --allowedTools "Read,Glob,Grep,Write,Edit" \
  --add-dir "$ROOT" \
  --add-dir "$D" \
  --max-turns 80 \
  --output-format stream-json --verbose \
  > $D/run_image_plan.jsonl 2> $D/run_image_plan.err
echo "=== EXIT rc=$? $(date '+%F %T') ==="
