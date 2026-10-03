#!/bin/bash
# ⚠ 已废弃（2026-10-03）。请使用 scripts/deploy-blog.sh（带未提交守卫 + /api/health 自检）。
# 本脚本曾因无守卫/无自检导致博客 Functions 静默消失（.memory/patterns/pitfalls.md P-005）。
echo "此脚本已废弃 → 改用 scripts/deploy-blog.sh" >&2
exit 1
