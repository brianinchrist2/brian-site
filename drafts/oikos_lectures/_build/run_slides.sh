#!/bin/bash
# 用 claude CLI（opus-5-5, xhigh）依据讲座大纲生成 HTML 演示文稿
set -uo pipefail
ROOT="/Users/brianw/projects/brian-site/brianinchrist/organicchurch/library/oikos_church"
CLAUDE="$HOME/.npm-global/bin/claude"
export CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0
unset PYTHONPATH
cd "$ROOT"

echo "=== START $(date '+%F %T') ==="
"$CLAUDE" -p "$(cat lectures/_build/prompt_slides.md)" \
  --model claude-opus-5-5 \
  --effort xhigh \
  --allowedTools "Read,Write,Edit,Glob,Grep,Bash" \
  --add-dir "$ROOT" \
  --add-dir "/Users/brianw/projects/brian-site/brianinchrist/organicchurch/assets" \
  --max-turns 300 \
  --output-format stream-json \
  --verbose \
  > lectures/_build/run_slides.jsonl 2> lectures/_build/run_slides.err
rc=$?
echo "=== EXIT rc=$rc $(date '+%F %T') ==="
exit $rc
