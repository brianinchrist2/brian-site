#!/usr/bin/env python3
"""把 image_plan 里所有生成图拼成一张 contact sheet，便于一次看全（分批，每批 8 张）。"""
import json
import pathlib
import sys
from PIL import Image, ImageDraw

D = pathlib.Path('/Users/brianw/projects/brian-site/drafts/oikos_lectures')
OUT = pathlib.Path.home() / 'ai/models/flux/outputs'
plan = json.loads((D / 'image_plan.json').read_text(encoding='utf-8'))
ids = [x['id'] for x in plan['images']]
batch = int(sys.argv[1]) if len(sys.argv) > 1 else 0
per = 8
sel = ids[batch * per:(batch + 1) * per]

TH = 300  # 每格高度
cols = 2
tiles = []
for i in sel:
    p = OUT / f'{i}.png'
    if not p.exists():
        tiles.append((i, None))
        continue
    im = Image.open(p).convert('RGB')
    w = int(im.width * TH / im.height)
    tiles.append((i, im.resize((w, TH), Image.LANCZOS)))

maxw = max((t[1].width if t[1] else 200) for t in tiles) if tiles else 200
rows = (len(tiles) + cols - 1) // cols
W = cols * (maxw + 20) + 20
H = rows * (TH + 46) + 20
sheet = Image.new('RGB', (W, H), (250, 246, 236))
dr = ImageDraw.Draw(sheet)
for n, (i, im) in enumerate(tiles):
    cx, cy = n % cols, n // cols
    x = 20 + cx * (maxw + 20)
    y = 20 + cy * (TH + 46)
    if im:
        sheet.paste(im, (x, y))
    else:
        dr.rectangle([x, y, x + maxw, y + TH], outline=(200, 60, 40), width=3)
        dr.text((x + 10, y + TH // 2), f'{i} MISSING', fill=(200, 60, 40))
    dr.text((x + 4, y + TH + 8), f'{i}', fill=(40, 27, 17))

out = f'/tmp/slidegen/sheet-{batch}.png'
sheet.save(out)
print('写出', out, sheet.size, f'({len([t for t in tiles if t[1]])}/{len(tiles)} 张已有)')
