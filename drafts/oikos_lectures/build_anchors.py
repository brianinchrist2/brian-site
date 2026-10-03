#!/usr/bin/env python3
"""建立「思维导图章 → manifest 章 → 书稿文件 → 小节锚点」索引。

产出 anchors.json：
  {"chapters":[{"key":<导图章标题>,"ch_id":"01","file":"manuscript/01_....md","title":..,
                "score":0.93,"headings":[{"aid":"h1-...","lv":2,"text":"...","line":11}]}],
   "unmatched":[<导图章标题>], "levels":{...}}

锚点 id 规则（必须与 reader.js 中的 aidFor() 完全一致）：
  h<该章正文标题序号(1起，含 h2/h3/h4)><-正文去掉空格与标点后前12字(小写)>
"""
import json, pathlib, re, difflib

ROOT = pathlib.Path('/Users/brianw/projects/brian-site/brianinchrist/organicchurch/library')
BOOK = ROOT / 'oikos_church'
D = pathlib.Path(__file__).parent


def norm(s):
    """标题归一化：去空格/标点/引号差异，用于导图章与 manifest 章配对。"""
    s = re.sub(r'[\s\u3000]+', '', s or '')
    s = re.sub(r'[“”"\'‘’「」《》（）()【】\[\]，,。.：:；;、！!？?—\-－–~·…]', '', s)
    return s.lower()


def aid_for(text, i):
    t = re.sub(r'[\s\u3000]+', '', text or '')
    t = re.sub(r'[^\u4e00-\u9fa5A-Za-z0-9]', '', t)
    t = t[:12].lower()
    return 'h%d%s' % (i, ('-' + t) if t else '')


def scan_headings(path):
    """返回正文（首个 # 标题之后）的 h2-h4 标题，附 aid；顺带统计层级与代码块内的伪标题。"""
    txt = path.read_text(encoding='utf-8').replace('\ufeff', '')
    lines = txt.split('\n')
    out, lv_counter, in_fence, fence_hits = [], {}, False, []
    body_started = False
    for ln, raw in enumerate(lines, 1):
        if re.match(r'^\s*```', raw):
            in_fence = not in_fence
            continue
        m = re.match(r'^(#{1,6})\s+(.*)$', raw)
        if not m:
            continue
        lv, text = len(m.group(1)), m.group(2).strip()
        if in_fence:
            fence_hits.append((ln, raw[:50])); continue
        lv_counter[lv] = lv_counter.get(lv, 0) + 1
        if lv == 1 and not body_started:
            body_started = True; continue
        if lv >= 2:
            out.append({'lv': lv, 'line': ln, 'text': text, 'aid': aid_for(text, len(out) + 1)})
    return out, lv_counter, fence_hits


def main():
    man = json.loads((BOOK / 'manifest.json').read_text(encoding='utf-8'))
    md = json.loads((D / 'mindmap_data.json').read_text(encoding='utf-8'))

    flat = []
    for p in man['parts']:
        for c in p['chapters']:
            flat.append({'part': p['part'], 'id': c['id'], 'title': c['title'], 'file': c['file']})

    mm = [ch for g in md['groups'] for ch in g['chapters']]

    heads, levels, fences = {}, {}, {}
    for c in flat:
        h, lv, fh = scan_headings(BOOK / c['file'])
        heads[c['id']] = h
        levels[c['id']] = lv
        if fh:
            fences[c['id']] = fh

    # 导图章 → manifest 章：按归一化标题相似度贪心一对一
    pairs = []
    for i, ch in enumerate(mm):
        for c in flat:
            sim = difflib.SequenceMatcher(None, norm(ch['title']), norm(c['title'])).ratio()
            cont = 1.0 if (norm(ch['title']) and norm(ch['title']) in norm(c['title'])) else 0.0
            pairs.append((max(sim, cont * 0.98), i, c['id']))
    pairs.sort(reverse=True)
    used_ch, used_man, mapping = set(), set(), {}
    for sc, i, cid in pairs:
        if i in used_ch or cid in used_man:
            continue
        used_ch.add(i); used_man.add(cid); mapping[i] = (cid, sc)

    chapters, unmatched = [], []
    for i, ch in enumerate(mm):
        if i not in mapping:
            unmatched.append(ch['title']); continue
        cid, sc = mapping[i]
        c = next(c for c in flat if c['id'] == cid)
        chapters.append({'key': ch['title'], 'ch_id': cid, 'part': c['part'], 'file': c['file'],
                         'title': c['title'], 'score': round(sc, 3),
                         'headings': heads[cid], 'n_points': len(ch['points'])})

    out = {'chapters': chapters, 'unmatched': unmatched,
           'skipped_manifest_chapters': [c['id'] for c in flat if c['id'] not in used_man],
           'levels': levels}
    (D / 'anchors.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')

    print('配对：%d/22' % len(chapters))
    for c in chapters:
        print('  %-34s → %-3s (%.2f) %2d 小节  %2d 要点' % (c['key'][:32], c['ch_id'], c['score'], len(c['headings']), c['n_points']))
    print('未配对的导图章：', unmatched or '无')
    print('未被使用的 manifest 章（预期含 keywords）：', out['skipped_manifest_chapters'])
    print('最低相似度：', min(c['score'] for c in chapters))
    tot = sum(len(c['headings']) for c in chapters)
    print('小节锚点合计：%d（覆盖 22 章）' % tot)
    bad = [(c['ch_id'], c['headings']) for c in chapters if not c['headings']]
    print('无任何小节的章：', [b[0] for b in bad] or '无')
    lvsum = {}
    for cid, d in levels.items():
        for k, v in d.items():
            lvsum[k] = lvsum.get(k, 0) + v
    print('全书标题层级计数（含 H1）：', dict(sorted(lvsum.items())))
    if fences:
        print('代码块内伪标题（已忽略）：', {k: len(v) for k, v in fences.items()})


if __name__ == '__main__':
    main()
