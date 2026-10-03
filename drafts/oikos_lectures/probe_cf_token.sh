#!/bin/bash
# 探测现有 CF token 的能力边界（只打印接口返回，不打印 token 本身）
set -uo pipefail
ENVF=/Users/brianw/projects/roomcraft/yiqisheji/.env
T=$(grep '^CLOUDFLARE_API_TOKEN=' "$ENVF" | cut -d= -f2- | tr -d '"'"'"'')
A=$(grep '^CLOUDFLARE_ACCOUNT_ID=' "$ENVF" | cut -d= -f2- | tr -d '"'"'"'')
H=(-H "Authorization: Bearer $T" -s -m 30)
echo "账户: ${A:0:8}…  token: ${T:0:6}…（已隐去）"
echo
echo "=== 1) token 自检 ==="
curl "${H[@]}" "https://api.cloudflare.com/client/v4/user/tokens/verify" | python3 -c "import sys,json;d=json.load(sys.stdin);print('success',d.get('success'),'| status',(d.get('result') or {}).get('status'),'|',(d.get('errors') or [{}])[0].get('message',''))"
echo "=== 2) 账户列表（可见账户）==="
curl "${H[@]}" "https://api.cloudflare.com/client/v4/accounts" | python3 -c "import sys,json;d=json.load(sys.stdin);rs=d.get('result') or [];print('账户数',len(rs));[print('  ',r['id'][:8]+'…',r['name']) for r in rs]"
echo "=== 3) KV 命名空间（已知可用）==="
curl "${H[@]}" "https://api.cloudflare.com/client/v4/accounts/$A/storage/kv/namespaces" | python3 -c "import sys,json;d=json.load(sys.stdin);print('success',d.get('success'),'| 数量',len(d.get('result') or []),'|',(d.get('errors') or [{}])[0].get('message',''))"
echo "=== 4) D1 数据库列表 ==="
curl "${H[@]}" "https://api.cloudflare.com/client/v4/accounts/$A/d1/database" | python3 -c "import sys,json;d=json.load(sys.stdin);print('success',d.get('success'),'| 数量',len(d.get('result') or []),'| err',(d.get('errors') or [{}])[0].get('message',''))"
echo "=== 5) 直接查 D1（与 wrangler 同路径）==="
curl "${H[@]}" -X POST "https://api.cloudflare.com/client/v4/accounts/$A/d1/database/0d035c3d-d7f0-47ad-b733-c4cacab516f2/query" \
  -H "Content-Type: application/json" -d '{"sql":"SELECT count(*) AS n FROM users"}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('success',d.get('success'),'| result',d.get('result'),'| err',(d.get('errors') or [{}])[0].get('message',''))"
