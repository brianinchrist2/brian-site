#!/bin/bash
# claude CLI(opus-5-5, xhigh)：要点 → 正文小节 锚点映射 → anchor_map.json
set -uo pipefail
CLAUDE="$HOME/.npm-global/bin/claude"
D=/Users/brianw/projects/brian-site/drafts/oikos_lectures
export CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0
unset PYTHONPATH
cd "$D"
rm -f anchor_map.json
echo "=== START $(date '+%F %T') ==="
"$CLAUDE" -p "$(cat $D/prompt_anchor_map.md)" \
  --model claude-opus-5-5 \
  --effort xhigh \
  --allowedTools "Read,Write" \
  --add-dir "$D" \
  --max-turns 30 \
  --output-format stream-json --verbose \
  > "$D/run_anchor_map.jsonl" 2> "$D/run_anchor_map.err"
echo "=== EXIT rc=$? $(date '+%F %T') ==="
ls -la "$D/anchor_map.json" 2>&1
