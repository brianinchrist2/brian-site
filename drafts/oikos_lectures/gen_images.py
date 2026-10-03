#!/usr/bin/env python3
"""按 image_plan.json 顺序批量出图（本机 klein 4B 快线），逐张记录耗时。

用法：python3 gen_images.py [--only id1,id2] [--dry]
产出：~/ai/models/flux/outputs/<id>.png + gen_report.json
"""
import argparse
import json
import pathlib
import subprocess
import sys
import time

D = pathlib.Path('/Users/brianw/projects/brian-site/drafts/oikos_lectures')
PLAN = D / 'image_plan.json'
OUTDIR = pathlib.Path.home() / 'ai/models/flux/outputs'
GUI = pathlib.Path.home() / 'ai/models/flux/gui_app'
PY = pathlib.Path.home() / 'ai/comfy/venv/bin/python'
UNET = 'flux-2-klein-4b-Q4_K_M.gguf'
TE = 'flux2-klein-4b-uncensored-q4_k_m.gguf'

ap = argparse.ArgumentParser()
ap.add_argument('--only', default='')
ap.add_argument('--dry', action='store_true')
a = ap.parse_args()

plan = json.loads(PLAN.read_text(encoding='utf-8'))
imgs = plan['images']
if a.only:
    want = {x.strip() for x in a.only.split(',') if x.strip()}
    imgs = [x for x in imgs if x['id'] in want]

if a.dry:
    for x in imgs:
        print(f"{x['id']:<28} {x['width']}x{x['height']}  slot={x['slot']:<5} style={x['style']:<26} {x['slide_title']}")
    print(f"共 {len(imgs)} 张")
    sys.exit(0)

OUTDIR.mkdir(parents=True, exist_ok=True)
report, t0 = [], time.time()
for i, x in enumerate(imgs, 1):
    out = OUTDIR / f"{x['id']}.png"
    cmd = [str(PY), 'run_flux2_lora.py',
           '--prompt', x['prompt'], '--negative', x.get('negative', ''),
           '--width', str(x['width']), '--height', str(x['height']),
           '--steps', str(x.get('steps', 6)), '--guidance', str(x.get('guidance', 3.5)),
           '--seed', str(x['seed']), '--unet', UNET, '--te', TE, '--out', str(out)]
    print(f"[{i}/{len(imgs)}] {x['id']}  {x['width']}x{x['height']}  {x['style']}", flush=True)
    t = time.time()
    p = subprocess.run(cmd, cwd=str(GUI), capture_output=True, text=True,
                       env={**__import__('os').environ, 'PYTHONPATH': ''})
    dur = time.time() - t
    ok = p.returncode == 0 and out.exists() and out.stat().st_size > 10000
    mark = 'SAVED' if 'SAVED::' in p.stdout else ('NO-SAVED-MARK' if ok else 'FAILED')
    print(f"    {'✔' if ok else '✗'} {dur:.0f}s  {mark}  {out.name}", flush=True)
    if not ok:
        tail = (p.stdout or '')[-400:] + (p.stderr or '')[-600:]
        print('    ! tail:', tail.replace('\n', ' | ')[-500:], flush=True)
    report.append({'id': x['id'], 'ok': ok, 'seconds': round(dur, 1),
                   'w': x['width'], 'h': x['height'], 'seed': x['seed'],
                   'style': x['style'], 'slot': x['slot'], 'path': str(out)})
    (D / 'gen_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

total = time.time() - t0
ok_n = sum(1 for r in report if r['ok'])
print(f"\n=== 完成 {ok_n}/{len(report)} 张，总耗时 {total/60:.1f} 分钟（平均 {total/max(len(report),1):.0f}s/张）===")
print('报告：', D / 'gen_report.json')
