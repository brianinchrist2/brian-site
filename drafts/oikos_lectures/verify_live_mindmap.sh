#!/bin/bash
# 线上验收：思维导图页 + manifest 链接 + reader.css
set -uo pipefail
MM="https://jiadongli.online/organicchurch/library/oikos_church/lectures/mindmap.html"
OUT=/tmp/live-mm.html
code=$(curl -sL -o "$OUT" -w '%{http_code}|%{size_download}|%{content_type}' --max-time 45 "$MM")
echo "mindmap.html → $code"
echo "节点框数: $(grep -c 'rect data-role="box"' "$OUT")"
echo "含布局数据: $(grep -c 'id="mm-geom"' "$OUT")"
echo "外链数(应为0): $(grep -oE 'https?://[^"'\'' )]+' "$OUT" | grep -vE 'jiadongli|brianinchrist|w3\.org|schema\.org' | sort -u | wc -l | tr -d ' ')"
echo "--- manifest.json ---"
curl -sL --max-time 45 "https://jiadongli.online/organicchurch/library/oikos_church/manifest.json" -o /tmp/live-manifest.json
python3 - <<'PY'
import json
m = json.load(open('/tmp/live-manifest.json'))
print('stat:', m['stat'])
for g in m['extras']:
    print('组:', g['title'], '| 条数', len(g['items']), '| 末条:', g['items'][-1]['label'], '->', g['items'][-1]['href'])
PY
echo "--- reader.css ---"
curl -sL --max-time 45 "https://jiadongli.online/organicchurch/library/assets/css/reader.css" -o /tmp/live-reader.css
echo "含多块分隔规则: $(grep -c 'rdr-extras-group + .rdr-extras-group' /tmp/live-reader.css)"
echo "--- reader.html ---"
curl -sL --max-time 45 "https://jiadongli.online/organicchurch/library/reader.html" -o /tmp/live-reader.html
echo "含 rdr-toc-scroll: $(grep -c 'rdr-toc-scroll' /tmp/live-reader.html)"
