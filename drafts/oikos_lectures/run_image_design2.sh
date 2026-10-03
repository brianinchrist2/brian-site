#!/bin/bash
# 第二轮：claude CLI(opus-5-5, xhigh) 设计第二幅配图
set -uo pipefail
ROOT="/Users/brianw/projects/brian-site/brianinchrist/organicchurch/library/oikos_church"
CLAUDE="$HOME/.npm-global/bin/claude"
export CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0
unset PYTHONPATH
cd "$ROOT"
D=/Users/brianw/projects/brian-site/drafts/oikos_lectures
echo "=== START $(date '+%F %T') ==="
"$CLAUDE" -p "$(cat $D/prompt_image_design2.md)" \
  --model claude-opus-5-5 \
  --effort xhigh \
  --allowedTools "Read,Glob,Grep" \
  --add-dir "$ROOT" \
  --max-turns 40 \
  --output-format stream-json --verbose \
  > $D/run_image_design2.jsonl 2> $D/run_image_design2.err
echo "=== EXIT rc=$? $(date '+%F %T') ==="
