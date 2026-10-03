#!/usr/bin/env python3
"""按 image_plan.json 把生成好的图插入四讲幻灯片。

策略：
- replace_svg=True  → 替换该页现有的 .fig 图解位
- replace_svg=False → 追加到页面主内容容器（.sec-body 优先，其次 .content，最后 section 末尾）
可逆：每个文件改动前备份到 backup/<name>.<ts>.bak
用法：python3 apply_plan.py [--dry] [--only id1,id2]
"""
import argparse
import json
import pathlib
import re
import shutil
import time

D = pathlib.Path('/Users/brianw/projects/brian-site/drafts/oikos_lectures')
SL = pathlib.Path('/Users/brianw/projects/brian-site/brianinchrist/organicchurch/library/oikos_church/lectures/slides')
OUT = pathlib.Path.home() / 'ai/models/flux/outputs'

CLS = {'full': 'fig plate r', 'tall': 'fig plate tall r', 'wide': 'band r', 'half': 'half r', 'spot': 'spot r'}

ap = argparse.ArgumentParser()
ap.add_argument('--dry', action='store_true')
ap.add_argument('--only', default='')
a = ap.parse_args()

plan = json.loads((D / 'image_plan.json').read_text(encoding='utf-8'))
imgs = plan['images']
if a.only:
    want = {s.strip() for s in a.only.split(',') if s.strip()}
    imgs = [x for x in imgs if x['id'] in want]

(SL / 'assets/img').mkdir(parents=True, exist_ok=True)
(D / 'backup').mkdir(parents=True, exist_ok=True)
ts = time.strftime('%H%M%S')

# 先把 PNG 转成 JPEG 放到位
from PIL import Image
for x in imgs:
    src = OUT / f"{x['id']}.png"
    if not src.exists():
        print(f"✗ 缺图 {src}（先跑 gen_images.py）")
        continue
    dst = SL / 'assets/img' / f"{x['id']}.jpg"
    Image.open(src).convert('RGB').save(dst, 'JPEG', quality=88)
    x['_dst'] = dst

by_file = {}
for x in imgs:
    if '_dst' in x:
        by_file.setdefault(x['lecture'], []).append(x)

for lecture, items in sorted(by_file.items()):
    html = SL / f'lecture-{lecture}.html'
    text = html.read_text(encoding='utf-8')
    shutil.copy2(html, D / 'backup' / f'lecture-{lecture}.html.{ts}.bak')
    for x in items:
        block = (f'<div class="{CLS[x["slot"]]}">\n'
                 f'      <img src="assets/img/{x["id"]}.jpg" alt="{x["caption"]}">\n'
                 f'      <p class="cap">{x["caption"]}<br><small>{x["credit"]}</small></p>\n'
                 f'    </div>')
        i = text.find(f'data-title="{x["slide_title"]}"')
        if i < 0:
            print(f"✗ {x['id']}: 找不到页《{x['slide_title']}》")
            continue
        s = text.rfind('<section class="slide', 0, i)
        e = text.find('</section>', i) + len('</section>')
        page = text[s:e]
        if x['replace_svg']:
            m = re.search(r'<div class="fig[^"]*">(?:(?!</div>).)*?</div>\s*', page, flags=re.S)
            if not m:
                print(f"✗ {x['id']}: 页内没有可替换的 .fig 块")
                continue
            newpage = page.replace(m.group(0), block + '\n    ', 1)
            how = 'replaced .fig'
        else:
            anchor = None
            for pat in (r'(<div class="sec-body">)', r'(<div class="content[^"]*">)'):
                mm = re.search(pat, page)
                if mm:
                    anchor = mm
                    break
            if anchor:
                # 找到该容器的匹配闭合 </div>（按层级计数）
                start = anchor.end(1)
                depth, j = 1, start
                while depth and j < len(page):
                    nxt_open = page.find('<div', j)
                    nxt_close = page.find('</div>', j)
                    if nxt_close < 0:
                        break
                    if 0 <= nxt_open < nxt_close:
                        depth += 1
                        j = nxt_open + 4
                    else:
                        depth -= 1
                        j = nxt_close + 6
                insert_at = j - 6
                newpage = page[:insert_at] + '  ' + block + '\n  ' + page[insert_at:]
                how = f'appended → {anchor.group(1)[:34]}…'
            else:
                notes = page.find('<aside')
                assert notes > 0, f'{x["id"]}: 找不到插入锚点'
                newpage = page[:notes] + '  ' + block + '\n  ' + page[notes:]
                how = 'appended → section 末尾'
        text = text[:s] + newpage + text[e:]
        print(f"{'[dry] ' if a.dry else ''}✔ {x['id']:<24} {x['slot']:<5} {x['slide_title']}  [{how}]")
    if not a.dry:
        html.write_text(text, encoding='utf-8')

print(f"\n备份：{D / 'backup'}/*.{ts}.bak")
