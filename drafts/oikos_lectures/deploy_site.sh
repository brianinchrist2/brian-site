#!/bin/bash
# 部署 brianinchrist/ → Cloudflare Pages 项目 brianinchrist-site
# wrangler v4 不接受 --config 自定义文件名，故在临时目录放一个标准 wrangler.toml，目录用 CLI 参数指定。
set -uo pipefail
export CLOUDFLARE_API_TOKEN="$(grep -m1 '^CLOUDFLARE_API_TOKEN=' /Users/brianw/projects/roomcraft/yiqisheji/.env | cut -d= -f2-)"
export CLOUDFLARE_ACCOUNT_ID="$(grep -m1 '^CLOUDFLARE_ACCOUNT_ID=' /Users/brianw/projects/roomcraft/yiqisheji/.env | cut -d= -f2-)"
cd /tmp/cfdeploy
echo "=== DEPLOY START $(date '+%F %T') ==="
npx wrangler pages deploy /Users/brianw/projects/brian-site/brianinchrist \
  --project-name=brianinchrist-site \
  --branch=main --commit-dirty=true 2>&1 | tail -30
echo "=== DEPLOY EXIT ${PIPESTATUS[0]:-?} $(date '+%F %T') ==="
