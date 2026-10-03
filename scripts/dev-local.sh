#!/usr/bin/env bash
# 本地全栈预览：静态页面 + Pages Functions（登录/批注等 API 全通）
# 数据用本地 D1/KV 模拟（.wrangler/state），完全不碰线上。
#
# 用法:  scripts/dev-local.sh [端口] [静态根目录]
#   scripts/dev-local.sh                # → http://localhost:8911/reader.html?book=...
#   scripts/dev-local.sh 8000           # 换端口
#   scripts/dev-local.sh 8911 brianinchrist   # 换 serve 根（如预览全站）
#
# ⚠️ 不要用 python3 -m http.server 测登录：它不支持 POST，/api/* 会返回
#    501 Unsupported method ('POST')。
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${1:-8911}"
SERVE_ROOT="${2:-brianinchrist/organicchurch/library}"

echo "==> 应用本地 D1 迁移（幂等，已应用的会跳过）"
WRANGLER_SEND_METRICS=false npx wrangler d1 migrations apply brianinchrist-db --local

echo "==> wrangler pages dev @ http://localhost:${PORT}  (serve: ${SERVE_ROOT})"
echo "    测试账号见 .dev.vars；Ctrl+C 停止"
exec env WRANGLER_SEND_METRICS=false npx wrangler pages dev "$SERVE_ROOT" --port "$PORT"
