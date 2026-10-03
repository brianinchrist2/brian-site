#!/usr/bin/env python3
"""由 anchors.json + mindmap_data.json 生成「要点→小节」映射任务的输入文件 anchor_map_input.json。

每条要点给一个稳定 pid = "<导图章序号(0起)>-<要点序号(0起)>"，便于逐条核对。
"""
import json, pathlib

D = pathlib.Path(__file__).parent
anchors = json.loads((D / 'anchors.json').read_text(encoding='utf-8'))
md = json.loads((D / 'mindmap_data.json').read_text(encoding='utf-8'))
mm = [ch for g in md['groups'] for ch in g['chapters']]

by_key = {c['key']: c for c in anchors['chapters']}
out, n = [], 0
for gi, ch in enumerate(mm):
    a = by_key.get(ch['title'])
    if not a:
        raise SystemExit('缺锚点：' + ch['title'])
    pts = [{'pid': '%d-%d' % (gi, pi), 'title': p['title'], 'summary': p['summary']}
           for pi, p in enumerate(ch['points'])]
    n += len(pts)
    out.append({'ch': a['ch_id'], 'key': ch['title'],
                'headings': [{'aid': h['aid'], 'text': h['text']} for h in a['headings']],
                'points': pts})

(D / 'anchor_map_input.json').write_text(json.dumps({'chapters': out}, ensure_ascii=False, indent=1), encoding='utf-8')
print('章节 %d，要点 %d，标题 %d' % (len(out), n, sum(len(c['headings']) for c in out)))
print('字节 %.1f KB' % ((D / 'anchor_map_input.json').stat().st_size / 1024))
