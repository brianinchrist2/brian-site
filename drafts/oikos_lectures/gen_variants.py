#!/usr/bin/env python3
"""按提示词文件 + 多个种子出变体（本机 klein 4B 快线）。

用法：
  python3 gen_variants.py --prompt p.txt --neg n.txt --seeds 1,2,3 \
     --w 512 --h 512 --steps 6 --guidance 3.5 --prefix l1-07-lvzi-v
"""
import argparse
import os
import pathlib
import subprocess
import time

ap = argparse.ArgumentParser()
ap.add_argument('--prompt', required=True)
ap.add_argument('--neg', default=None)
ap.add_argument('--seeds', required=True)
ap.add_argument('--w', type=int, default=512)
ap.add_argument('--h', type=int, default=512)
ap.add_argument('--steps', type=int, default=6)
ap.add_argument('--guidance', type=float, default=3.5)
ap.add_argument('--prefix', required=True)
a = ap.parse_args()

GUI = pathlib.Path.home() / 'ai/models/flux/gui_app'
PY = pathlib.Path.home() / 'ai/comfy/venv/bin/python'
OUTDIR = pathlib.Path.home() / 'ai/models/flux/outputs'
prompt = pathlib.Path(a.prompt).read_text(encoding='utf-8').strip()
neg = pathlib.Path(a.neg).read_text(encoding='utf-8').strip() if a.neg else ''
seeds = [s.strip() for s in a.seeds.split(',') if s.strip()]

print(f"提示词 {len(prompt)} 字符 | negative {len(neg)} 字符 | {len(seeds)} 个种子 @ {a.w}x{a.h} {a.steps}步")
for n, sd in enumerate(seeds, 1):
    out = OUTDIR / f'{a.prefix}{n}-s{sd}.png'
    cmd = [str(PY), 'run_flux2_lora.py', '--prompt', prompt, '--negative', neg,
           '--width', str(a.w), '--height', str(a.h), '--steps', str(a.steps),
           '--guidance', str(a.guidance), '--seed', sd,
           '--unet', 'flux-2-klein-4b-Q4_K_M.gguf',
           '--te', 'flux2-klein-4b-uncensored-q4_k_m.gguf', '--out', str(out)]
    print(f"[{n}/{len(seeds)}] seed={sd}", flush=True)
    t = time.time()
    p = subprocess.run(cmd, cwd=str(GUI), capture_output=True, text=True,
                       env={**os.environ, 'PYTHONPATH': ''})
    dur = time.time() - t
    ok = p.returncode == 0 and out.exists() and out.stat().st_size > 10000
    print(f"    {'✔' if ok else '✗'} {dur:.0f}s  {out.name}", flush=True)
    if not ok:
        print('    !', ((p.stdout or '')[-300:] + (p.stderr or '')[-400:]).replace('\n', ' | ')[-450:])
