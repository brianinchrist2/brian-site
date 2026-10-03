#!/usr/bin/env python3
"""把 15 个插图页拼成一张总览图（4 列）。"""
import json
import pathlib
from PIL import Image, ImageDraw

D = pathlib.Path('/Users/brianw/projects/brian-site/drafts/oikos_lectures')
plan = json.loads((D / 'image_plan.json').read_text(encoding='utf-8'))
ids = [x['id'] for x in plan['images']]

TW, TH = 470, 264          # 每格缩略尺寸
cols, pad, lab = 4, 10, 22
rows = (len(ids) + cols - 1) // cols
W = cols * (TW + pad) + pad
H = rows * (TH + lab + pad) + pad
sheet = Image.new('RGB', (W, H), (250, 246, 236))
dr = ImageDraw.Draw(sheet)
for n, i in enumerate(ids):
    p = pathlib.Path(f'/tmp/slidegen/pg-{i}.png')
    if not p.exists():
        continue
    im = Image.open(p).convert('RGB').resize((TW, TH), Image.LANCZOS)
    x = pad + (n % cols) * (TW + pad)
    y = pad + (n // cols) * (TH + lab + pad)
    sheet.paste(im, (x, y))
    dr.rectangle([x, y, x + TW, y + TH], outline=(226, 216, 195))
    dr.text((x + 3, y + TH + 5), f"{n+1}. {i}", fill=(58, 40, 26))
out = f'/tmp/slidegen/overview-{len(ids)}pages.jpg'
sheet.save(out, 'JPEG', quality=88)
print('写出', out, sheet.size, f"{sheet.stat().st_size if hasattr(sheet,'stat') else pathlib.Path(out).stat().st_size//1024}KB")
print('尺寸 %.0f KB' % (pathlib.Path(out).stat().st_size / 1024))
