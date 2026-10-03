#!/bin/bash
# claude CLI(opus-5-5, xhigh) 通读全书 → mindmap_data.json（瀑布式思维导图数据）
set -uo pipefail
ROOT="/Users/brianw/projects/brian-site/brianinchrist/organicchurch/library/oikos_church"
CLAUDE="$HOME/.npm-global/bin/claude"
export CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0
unset PYTHONPATH
D=/Users/brianw/projects/brian-site/drafts/oikos_lectures
cd "$ROOT"
rm -f "$D/mindmap_data.json"
echo "=== START $(date '+%F %T') ==="
"$CLAUDE" -p "$(cat $D/prompt_mindmap.md)" \
  --model claude-opus-5-5 \
  --effort xhigh \
  --allowedTools "Read,Glob,Grep,Write" \
  --add-dir "$ROOT" \
  --add-dir "$D" \
  --max-turns 60 \
  --output-format stream-json --verbose \
  > "$D/run_mindmap.jsonl" 2> "$D/run_mindmap.err"
echo "=== EXIT rc=$? $(date '+%F %T') ==="
ls -la "$D/mindmap_data.json" 2>&1
