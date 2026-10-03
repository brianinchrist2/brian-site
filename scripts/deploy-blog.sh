#!/bin/bash
# 部署 brianinchrist/ + Functions → Pages 项目 brianinchrist-site（同域 API，见 ADR-011）
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${TMPDIR:-/tmp}/cfdeploy-blog"
# 守卫：不把未提交的后端改动随内容发布带上线
if [ -n "$(git -C "$REPO" status --porcelain -- functions migrations wrangler-blog.toml brianinchrist/_routes.json)" ]; then
  echo "functions/ migrations/ 或部署配置有未提交改动，拒绝部署"; exit 1
fi
rm -rf "$WORK" && mkdir -p "$WORK"
sed "s#^pages_build_output_dir *=.*#pages_build_output_dir = \"$REPO/brianinchrist\"#" "$REPO/wrangler-blog.toml" > "$WORK/wrangler.toml"
cp -R "$REPO/functions" "$WORK/functions"          # wrangler 只认 cwd/functions（cli.js:370549）
cd "$WORK"
npx wrangler pages deploy --branch=main --commit-dirty=true
# 自检：API 必须返回 JSON 且 ok——这正是 P0 事故的检测点
curl -fsS https://jiadongli.online/api/health | grep -q '"status":"ok"' || { echo "❌ /api/health 不是 ok JSON"; exit 1; }
