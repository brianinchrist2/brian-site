#!/bin/bash
# 读 KV：3 个遗留用户详情（只提取非敏感字段）+ 账户下全部命名空间的键数量
set -uo pipefail
ENVF=/Users/brianw/projects/roomcraft/yiqisheji/.env
T=$(grep '^CLOUDFLARE_API_TOKEN=' "$ENVF" | cut -d= -f2- | tr -d '"'"'"'')
A=$(grep '^CLOUDFLARE_ACCOUNT_ID=' "$ENVF" | cut -d= -f2- | tr -d '"'"'"'')
H=(-H "Authorization: Bearer $T" -s -m 30)

echo "=== 全部命名空间 ==="
curl "${H[@]}" "https://api.cloudflare.com/client/v4/accounts/$A/storage/kv/namespaces" > /tmp/kvns.json
python3 - <<'PY'
import json, subprocess, os
ns = json.load(open('/tmp/kvns.json'))['result']
env = dict(os.environ)
for x in sorted(ns, key=lambda r: r['title']):
    print('  %-34s %s' % (x['title'], x['id']))
PY

echo
echo "=== 课程系统 KV（b8ae6043…）里 3 个用户的值结构 ==="
for K in "user:bill.woo70@gmail.com" "user:brianinchrist2023@proton.me" "user:test@example.com"; do
  curl "${H[@]}" "https://api.cloudflare.com/client/v4/accounts/$A/storage/kv/namespaces/b8ae6043b8784ce59fdbd602e4c2da0c/values/$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$K")" > /tmp/kvuser.json
  python3 - "$K" <<'PY'
import json, sys
k = sys.argv[1]
try:
    v = json.load(open('/tmp/kvuser.json'))
except Exception as e:
    print(' ', k, '解析失败', e); raise SystemExit
if isinstance(v, dict) and 'email' in v:
    safe = {kk: v.get(kk) for kk in ('email', 'nickname', 'name', 'roles', 'role', 'createdAt', 'created_at', 'id', 'verified')}
    print(' ', k)
    print('     ', json.dumps(safe, ensure_ascii=False))
    print('      有密码字段:', any(x in v for x in ('password', 'passwordHash', 'hash', 'salt')), '| 全部字段:', sorted(v.keys()))
else:
    print(' ', k, '→', json.dumps(v, ensure_ascii=False)[:200])
PY
done
