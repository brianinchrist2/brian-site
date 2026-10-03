#!/bin/bash
# 列出课程系统用户：D1 users 表 + KV 里遗留的 user:* 键（不回显任何密钥）
set -uo pipefail
ENVF=/Users/brianw/projects/roomcraft/yiqisheji/.env
export CLOUDFLARE_API_TOKEN=$(grep '^CLOUDFLARE_API_TOKEN=' "$ENVF" | cut -d= -f2- | tr -d '"'"'"'')
export CLOUDFLARE_ACCOUNT_ID=$(grep '^CLOUDFLARE_ACCOUNT_ID=' "$ENVF" | cut -d= -f2- | tr -d '"'"'"'')
cd /Users/brianw/projects/brian-site

echo "=== D1: users 表 ==="
npx wrangler d1 execute brianinchrist-db --remote --json \
  --command "SELECT id, email, nickname, roles, created_at FROM users ORDER BY created_at" \
  > /tmp/d1.users.json 2>/tmp/d1.users.err
rc=$?
echo "rc=$rc"
if [ $rc -ne 0 ]; then tail -6 /tmp/d1.users.err; fi
python3 - <<'PY'
import json
try:
    d = json.load(open('/tmp/d1.users.json'))
except Exception as e:
    print('解析失败:', e); raise SystemExit
rows = d[0]['results'] if isinstance(d, list) else d.get('results', [])
print('D1 users 行数:', len(rows))
for r in rows:
    print('  %-28s %-14s %-16s %s' % (r.get('email'), r.get('nickname'), r.get('roles'), (r.get('created_at') or '')[:19]))
PY

echo
echo "=== KV: 遗留 user:* 键 ==="
npx wrangler kv key list --namespace-id b8ae6043b8784ce59fdbd602e4c2da0c --remote \
  > /tmp/kv.keys.json 2>/tmp/kv.keys.err
rc2=$?
echo "rc=$rc2"
if [ $rc2 -ne 0 ]; then tail -6 /tmp/kv.keys.err; fi
python3 - <<'PY'
import json
try:
    ks = json.load(open('/tmp/kv.keys.json'))
except Exception as e:
    print('解析失败:', e); raise SystemExit
names = [k['name'] for k in ks] if isinstance(ks, list) else []
u = [n for n in names if n.startswith('user:')]
print('KV 键总数:', len(names), '| user:* 键:', len(u))
for n in u:
    print('  ', n)
PY
