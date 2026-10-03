#!/usr/bin/env python3
"""把 shoot_pages.cjs 产出的 15 张页面截图拼成 2 张复核用拼版。"""
import json
import pathlib
from PIL import Image, ImageDraw

D = pathlib.Path('/Users/brianw/projects/brian-site/drafts/oikos_lectures')
plan = json.loads((D / 'image_plan.json').read_text(encoding='utf-8'))
ids = [x['id'] for x in plan['images']]

TH = 300
for batch in (0, 1):
    sel = ids[batch * 8:(batch + 1) * 8]
    tiles = []
    for i in sel:
        p = pathlib.Path(f'/tmp/slidegen/pg-{i}.png')
        if p.exists():
            im = Image.open(p).convert('RGB')
            tiles.append((i, im.resize((int(im.width * TH / im.height), TH), Image.LANCZOS)))
    if not tiles:
        continue
    w = tiles[0][1].width
    W = 2 * (w + 16) + 16
    H = ((len(tiles) + 1) // 2) * (TH + 40) + 16
    sheet = Image.new('RGB', (W, H), (245, 240, 228))
    dr = ImageDraw.Draw(sheet)
    for n, (i, im) in enumerate(tiles):
        x = 16 + (n % 2) * (w + 16)
        y = 16 + (n // 2) * (TH + 40)
        sheet.paste(im, (x, y))
        dr.text((x + 4, y + TH + 8), i, fill=(40, 27, 17))
    out = f'/tmp/slidegen/pagesheet-{batch}.png'
    sheet.save(out)
    print('写出', out, sheet.size, len(tiles), '页')
