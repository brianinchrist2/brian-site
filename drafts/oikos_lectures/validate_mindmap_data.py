#!/usr/bin/env python3
"""校验 mindmap_data.json：schema、字数上限、重复、以及打印全树供人工通读。"""
import json, pathlib, re, sys

P = pathlib.Path(__file__).with_name('mindmap_data.json')
d = json.loads(P.read_text(encoding='utf-8'))
bad, stats = [], {}
root = d.get('root', {})
groups = d.get('groups', [])

def chk(s, maxn, where, sentence=True):
    if not isinstance(s, str) or not s.strip():
        bad.append(f'{where}: 空')
        return 0
    t = s.strip()
    if len(t) > maxn:
        bad.append(f'{where}: 超长 {len(t)}>{maxn} — {t[:40]}…')
    if re.search(r'[#*`\[\]]|[\U0001F300-\U0001FAFF\u2190-\u21FF]', t):
        bad.append(f'{where}: 含 markdown/符号 — {t[:30]}')
    if sentence and not t.endswith(('。', '？', '！', '”', '）')):
        bad.append(f'{where}: 未以句号收尾 — {t[-14:]}')
    if not sentence and t.endswith('。'):
        bad.append(f'{where}: 标题不该带句号 — {t}')
    return len(t)

print('书名:', root.get('title'), '|', root.get('summary'))
stats['root'] = 1
nch = npt = 0
lens = []
for gi, g in enumerate(groups):
    print(f'\n== 组{gi + 1} {g.get("title")} — {g.get("summary")}')
    chk(g.get('summary', ''), 70, f'组{gi + 1} summary')
    for ch in g.get('chapters', []):
        nch += 1
        print(f'   · {ch.get("title")} — {ch.get("summary")}')
        chk(ch.get('summary', ''), 70, f'{ch.get("title")} summary')
        for p in ch.get('points', []):
            npt += 1
            lens.append(chk(p.get('summary', ''), 60, f'{ch.get("title")}/{p.get("title")}'))
            chk(p.get('title', ''), 18, f'{ch.get("title")}/{p.get("title")} title', sentence=False)
            print(f'       - {p.get("title")} — {p.get("summary")}')
stats.update(groups=len(groups), chapters=nch, points=npt)
print('\n统计:', stats)
print('要点一句话长度 平均 %.1f / 最短 %d / 最长 %d' % (sum(lens) / len(lens), min(lens), max(lens)))
# 重复检查
allp = [p['title'] for g in groups for c in g['chapters'] for p in c['points']]
dup = {t for t in allp if allp.count(t) > 1}
print('重复要点标题:', dup or '无')
print('\n问题 %d 条:' % len(bad))
for b in bad[:40]:
    print('  !', b)
