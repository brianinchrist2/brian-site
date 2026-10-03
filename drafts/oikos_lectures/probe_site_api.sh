#!/bin/bash
# jiadongli.online 上 API 是否真的在跑（functions 是否部署）
set -uo pipefail
B=https://jiadongli.online
echo "=== GET /api/health ==="
curl -s -m 25 -o /tmp/a.txt -w "HTTP %{http_code}  ctype=%{content_type}  size=%{size_download}\n" "$B/api/health"; head -c 120 /tmp/a.txt; echo; echo
echo "=== GET /api/user/profile（带假 token）==="
curl -s -m 25 -H "Authorization: Bearer bogus" -o /tmp/b.txt -w "HTTP %{http_code}  ctype=%{content_type}  size=%{size_download}\n" "$B/api/user/profile"; head -c 200 /tmp/b.txt; echo; echo
echo "=== POST /api/auth/signin（假凭据，安全）==="
curl -s -m 25 -X POST -H 'Content-Type: application/json' -d '{"email":"nobody@example.invalid","password":"x"}' -o /tmp/c.txt -w "HTTP %{http_code}  ctype=%{content_type}  size=%{size_download}\n" "$B/api/auth/signin"; head -c 200 /tmp/c.txt; echo; echo
echo "=== 本地 _redirects 内容 ==="
cat /Users/brianw/projects/brian-site/brianinchrist/_redirects 2>/dev/null | head -20
