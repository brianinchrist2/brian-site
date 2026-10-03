#!/bin/bash
# klein 4B 快线出图（第二幅；设计来自 claude cli opus）
set -uo pipefail
D=/Users/brianw/projects/brian-site/drafts/oikos_lectures
cd ~/ai/models/flux/gui_app
echo "=== START $(date '+%F %T') ==="
env -u PYTHONPATH ~/ai/comfy/venv/bin/python run_flux2_lora.py \
  --prompt "$(cat $D/l2_scaffold_prompt.txt)" \
  --negative "$(cat $D/l2_scaffold_negative.txt)" \
  --width 896 --height 512 \
  --steps 6 --guidance 3.5 \
  --seed 20261002 \
  --unet flux-2-klein-4b-Q4_K_M.gguf \
  --te flux2-klein-4b-uncensored-q4_k_m.gguf \
  --out ~/ai/models/flux/outputs/l2-oikos-scaffold-01.png
echo "=== EXIT rc=$? $(date '+%F %T') ==="
