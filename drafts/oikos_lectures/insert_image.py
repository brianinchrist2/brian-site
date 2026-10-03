#!/usr/bin/env python3
"""把某个 SVG 图解位替换成照片级配图（可逆，改动前自动备份）。

用法示例：
  python3 insert_image.py \
    --html lecture-2.html --title "为什么是家：殿与家" \
    --src ~/ai/models/flux/outputs/l2-oikos-scaffold-01.jpg \
    --name l2-oikos-scaffold.jpg \
    --alt "黄昏里刚落成的石屋，门内油灯亮着；墙角脚手架已拆下一半，木杆整齐码在地上" \
    --cap "殿只是中途的脚手架，家才是终极的居所" \
    --cap-note "AI 生成示意图，非考古复原" \
    --grid "1080px 1fr"
"""
import argparse
import pathlib
import re
import shutil

SLIDES = pathlib.Path('/Users/brianw/projects/brian-site/brianinchrist/organicchurch/library/oikos_church/lectures/slides')
BACKUP = pathlib.Path('/Users/brianw/projects/brian-site/drafts/oikos_lectures/backup')

ap = argparse.ArgumentParser()
ap.add_argument('--html', required=True)
ap.add_argument('--title', required=True, help='该页 data-title')
ap.add_argument('--src', required=True, help='生成的 PNG/JPG 路径')
ap.add_argument('--name', required=True, help='放入 assets/img/ 的文件名（.jpg）')
ap.add_argument('--alt', required=True)
ap.add_argument('--cap', required=True)
ap.add_argument('--cap-note', default='')
ap.add_argument('--grid', default='', help='若给出，则替换该页 .g-fig 的 grid-template-columns')
a = ap.parse_args()

BACKUP.mkdir(parents=True, exist_ok=True)
(SLIDES / 'assets/img').mkdir(parents=True, exist_ok=True)

html = SLIDES / a.html
shutil.copy2(html, BACKUP / f'{a.html}.bak')

src = pathlib.Path(a.src).expanduser()
dst = SLIDES / 'assets/img' / a.name
shutil.copy2(src, dst)

text = html.read_text(encoding='utf-8')
i = text.find(f'data-title="{a.title}"')
assert i > 0, f'找不到页 {a.title}'
start = text.rfind('<section class="slide', 0, i)
end = text.find('</section>', i) + len('</section>')
page = text[start:end]

m = re.search(r'<div class="fig r">.*?</div>', page, flags=re.S)
assert m and '<svg' in m.group(0), '找不到可替换的 SVG 图解块'
old = m.group(0)

note = f'<br><small>{a.cap_note}</small>' if a.cap_note else ''
new = ('<div class="fig plate r">\n'
       f'      <img src="assets/img/{a.name}" alt="{a.alt}">\n'
       f'      <p class="cap">{a.cap}{note}</p>\n'
       '    </div>')

page2 = page.replace(old, new)
if a.grid:
    page2b = re.sub(r'(<div class="g-fig content" style="grid-template-columns:)[^"]*(")',
                    lambda mm: mm.group(1) + a.grid + mm.group(2), page2, count=1)
    assert page2b != page2, '未能替换 grid 列宽'
    page2 = page2b

text = text[:start] + page2 + text[end:]
html.write_text(text, encoding='utf-8')

print(f'✔ {a.html} / {a.title}')
print(f'  图: assets/img/{a.name}  {dst.stat().st_size:,} bytes')
if a.grid:
    print(f'  grid → {a.grid}')
print(f'  备份: {BACKUP / (a.html + ".bak")}')
