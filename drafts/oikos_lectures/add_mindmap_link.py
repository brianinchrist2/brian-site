#!/usr/bin/env python3
"""把「全书导览 · 瀑布式思维导图」链接追加到 manifest.json 的 extras 最末（目录最下面）。

幂等：已存在则更新，不重复添加。同时订正过时的 stat 字数（13万 → 20万）。
"""
import json, pathlib, sys

M = pathlib.Path('/Users/brianw/projects/brian-site/brianinchrist/organicchurch/library/oikos_church/manifest.json')
LABEL = '全书大纲'
HREF = 'oikos_church/lectures/mindmap.html'
GROUP = '全书导览'

def main():
    m = json.loads(M.read_text(encoding='utf-8'))
    ex = m.setdefault('extras', [])
    item = {'label': LABEL, 'href': HREF, 'note': '可折叠 · 附瀑布图'}
    # 去掉可能已存在的同 href 条目（保持幂等）
    for g in ex:
        g['items'] = [it for it in g.get('items', []) if it.get('href') != HREF]
    grp = next((g for g in ex if g.get('title') == GROUP), None)
    if grp is None:
        grp = {'title': GROUP, 'items': []}
        ex.append(grp)          # 追加到最末 = 目录最下面
    grp['items'].append(item)
    # 清掉被掏空的组
    m['extras'] = [g for g in ex if g.get('items')]
    # 把 mindmap 组挪到最末，保证"最下面"
    m['extras'].sort(key=lambda g: 0 if g.get('title') != GROUP else 1)
    # 订正过时字数
    if m.get('stat', '').startswith('全书 18 章'):
        m['stat'] = '全书 18 章 · 六部 · 约 20 万字'
    M.write_text(json.dumps(m, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for g in m['extras']:
        print('组:', g['title'])
        for it in g['items']:
            print('   ', it['label'], '->', it['href'], '|', it.get('note', ''))
    print('stat:', m['stat'])

if __name__ == '__main__':
    main()
