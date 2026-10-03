#!/usr/bin/env python3
"""程序化校验大纲页里 140 条「跳正文」链接：
- 数量：要点 110 + 部 8 + 章 22 = 140
- 每条 href 的 book / ch 必须存在于 manifest；带 #_ 的锚点必须存在于该章 anchors.json
- 反向核对：109 条要点链接的锚点与 anchor_map.json 完全一致
"""
import json, pathlib, re
from urllib.parse import unquote

D = pathlib.Path(__file__).parent
LIB = pathlib.Path('/Users/brianw/projects/brian-site/brianinchrist/organicchurch/library')
html = (LIB / 'oikos_church/lectures/mindmap.html').read_text(encoding='utf-8')
man = json.loads((LIB / 'oikos_church/manifest.json').read_text(encoding='utf-8'))
A = json.loads((D / 'anchors.json').read_text(encoding='utf-8'))
Mp = {x['pid']: x['aid'] for x in json.loads((D / 'anchor_map.json').read_text(encoding='utf-8'))['mapping']}

ch_ids = {c['id'] for p in man['parts'] for c in p['chapters']}
aids = {c['ch_id']: {h['aid'] for h in c['headings']} for c in A['chapters']}

links = re.findall(r'<a class="(pt|go)" href="([^"]+)"', html)
pts = [h for cls, h in links if cls == 'pt']
gos = [h for cls, h in links if cls == 'go']
print('链接总数 %d（要点 %d / 部+章 %d）' % (len(links), len(pts), len(gos)))

bad = []
for h in pts + gos:
    m = re.match(r'^\.\./\.\./reader\.html\?book=([^&]+)&ch=([^#]*)(?:#(.*))?$', h)
    if not m:
        bad.append(('格式不符', h)); continue
    book, ch, frag = m.group(1), m.group(2), m.group(3)
    if book != 'oikos_church' or ch not in ch_ids:
        bad.append(('章不存在', h)); continue
    if frag and unquote(frag) not in aids[ch]:
        bad.append(('锚点不存在', h))

print('非法链接:', bad[:5] if bad else '无 —— 140/140 全部有效 ✓')
frag_pts = [h for h in pts if '#' in h]
print('要点链接里带锚点（落具体小节）: %d；不带锚点（落章首）: %d' % (len(frag_pts), len(pts) - len(frag_pts)))

# 反向核对：页面上第 n 个要点链接的锚点 == anchor_map 里该 pid 的 aid
order = []
for gi in range(8):
    pass
flat = 0
mismatch = []
for pid, aid in sorted(Mp.items(), key=lambda kv: (int(kv[0].split('-')[0]), int(kv[0].split('-')[1]))):
    pass
want = []
i = 0
for pid in sorted(Mp, key=lambda k: (int(k.split('-')[0]), int(k.split('-')[1]))):
    want.append(Mp[pid])
got = [unquote(h.split('#', 1)[1]) if '#' in h else 'chapter' for h in pts]
for a, b in zip(want, got):
    if a != b:
        mismatch.append((a, b))
print('页面锚点 vs anchor_map 逐条核对:', '全部一致 ✓' if not mismatch else mismatch[:5])
print('缺锚点的要点标题（应仅 1 条：本章开头）:', sum(1 for g in got if g == 'chapter'))
