#!/usr/bin/env python3
"""校验 anchor_map.json：覆盖全部 pid、aid 必须存在于对应章的 headings、无重复 pid。
不符的分两类打印：非法 aid（会被程序判错）/ 缺失 pid。"""
import json, pathlib
from collections import Counter

D = pathlib.Path(__file__).parent
inp = json.loads((D / 'anchor_map_input.json').read_text(encoding='utf-8'))
mp = json.loads((D / 'anchor_map.json').read_text(encoding='utf-8'))

want, aid_of, ch_of = {}, {}, {}
for c in inp['chapters']:
    aids = {h['aid'] for h in c['headings']}
    for p in c['points']:
        want[p['pid']] = (c['ch'], p['title'])
        aid_of[p['pid']] = aids
        ch_of[p['pid']] = c['ch']

got = mp['mapping'] if isinstance(mp, dict) and 'mapping' in mp else (mp if isinstance(mp, list) else [])
print('输出条数:', len(got))
cnt = Counter(x['pid'] for x in got)
dup = [k for k, v in cnt.items() if v > 1]
missing = [p for p in want if p not in cnt]
extra = [p for p in cnt if p not in want]
print('重复 pid:', dup or '无')
print('缺失 pid:', len(missing), missing[:8])
print('多余 pid:', extra or '无')

bad = [(x['pid'], x['aid'], want.get(x['pid'], ('?', ''))[1]) for x in got if x['pid'] in want and x['aid'] != 'chapter' and x['aid'] not in aid_of[x['pid']]]
print('非法 aid:', len(bad))
for b in bad[:10]:
    print('   ', b[0], '→', b[1], '（该章「%s」）' % b[2][:22])

chlevel = [x for x in got if x['aid'] == 'chapter']
print('落到章首（chapter）的要点:', len(chlevel))
print('落到具体小节的要点:', len(got) - len(chlevel) - len(bad))
hit = Counter(x['aid'] for x in got if x['aid'] != 'chapter')
print('被多个要点共用的小节:', [(k, v) for k, v in hit.items() if v > 1][:6])
print('OK' if not (bad or missing or dup or extra) else '❌ 有需修的问题')
