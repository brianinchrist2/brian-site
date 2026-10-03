#!/usr/bin/env python3
"""l1-07 三个变体并排对比 + 换图（选定后）。

用法：
  python3 compare_l107.py                # 生成对比图 /tmp/slidegen/l107-compare.jpg
  python3 compare_l107.py --pick 2       # 把第 2 个变体换入 slides/assets/img/l1-07-lvzi.jpg（旧图备份）
"""
import argparse
import glob
import pathlib
import shutil
from PIL import Image, ImageDraw

OUTDIR = pathlib.Path.home() / 'ai/models/flux/outputs'
D = pathlib.Path('/Users/brianw/projects/brian-site/drafts/oikos_lectures')
IMG = pathlib.Path('/Users/brianw/projects/brian-site/brianinchrist/organicchurch/library/oikos_church/lectures/slides/assets/img')

ap = argparse.ArgumentParser()
ap.add_argument('--pick', type=int, default=0)
a = ap.parse_args()

cands = sorted(glob.glob(str(OUTDIR / 'l107-v2-*.png')))
cands += [str(OUTDIR / 'l1-07-lvzi.png')]          # 末尾附上旧图对照
if not cands:
    raise SystemExit('没有找到变体')
print('候选：')
for i, c in enumerate(cands, 1):
    print(f"  {i}. {pathlib.Path(c).name}")

if a.pick:
    chosen = pathlib.Path(cands[a.pick - 1])
    (D / 'backup').mkdir(parents=True, exist_ok=True)
    old = IMG / 'l1-07-lvzi.jpg'
    if old.exists():
        shutil.copy2(old, D / 'backup' / 'l1-07-lvzi.v1.jpg')
    Image.open(chosen).convert('RGB').save(old, 'JPEG', quality=88)
    print(f"\n✔ 已换入 {chosen.name} → {old}（旧图备份 backup/l1-07-lvzi.v1.jpg）")
    raise SystemExit(0)

# 对比图
TH = 420
tiles = []
for c in cands:
    im = Image.open(c).convert('RGB')
    tiles.append((pathlib.Path(c).stem, im.resize((int(im.width * TH / im.height), TH), Image.LANCZOS)))
W = sum(t[1].width + 16 for t in tiles) + 16
H = TH + 50
sheet = Image.new('RGB', (W, H), (250, 246, 236))
dr = ImageDraw.Draw(sheet)
x = 16
for i, (name, im) in enumerate(tiles, 1):
    sheet.paste(im, (x, 16))
    dr.text((x + 3, 16 + TH + 8), f'{i}. {name}', fill=(40, 27, 17))
    x += im.width + 16
out = '/tmp/slidegen/l107-compare.jpg'
sheet.save(out, 'JPEG', quality=90)
print('\n对比图：', out, sheet.size)
