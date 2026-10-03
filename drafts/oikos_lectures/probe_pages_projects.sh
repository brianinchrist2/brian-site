#!/bin/bash
# 查 Pages 项目配置：是否有 KV/D1 绑定、functions 是否属于该项目
set -uo pipefail
ENVF=/Users/brianw/projects/roomcraft/yiqisheji/.env
T=$(grep '^CLOUDFLARE_API_TOKEN=' "$ENVF" | cut -d= -f2- | tr -d '"'"'"'')
A=$(grep '^CLOUDFLARE_ACCOUNT_ID=' "$ENVF" | cut -d= -f2- | tr -d '"'"'"'')
H=(-H "Authorization: Bearer $T" -s -m 30)
curl "${H[@]}" "https://api.cloudflare.com/client/v4/accounts/$A/pages/projects" > /tmp/pg.json
python3 - <<'PY'
import json
d = json.load(open('/tmp/pg.json'))
if not d.get('success'):
    print('列项目失败:', (d.get('errors') or [{}])[0].get('message')); raise SystemExit
for p in d['result']:
    doms = [x if isinstance(x, str) else x.get('name') for x in (p.get('domains') or [])]
    print('项目 %-24s 子域 %-42s 域名 %s' % (p['name'], p.get('subdomain', ''), doms))
    dc = (p.get('deployment_configs') or {}).get('production') or {}
    kv = dc.get('kv_namespaces') or {}
    d1 = dc.get('d1_databases') or {}
    envs = list((dc.get('env_vars') or {}).keys())
    print('     KV 绑定:', {k: v.get('namespace_id', '')[:8] + '…' for k, v in kv.items()} or '无')
    print('     D1 绑定:', {k: v.get('id', '')[:8] + '…' for k, v in d1.items()} or '无')
    print('     环境变量:', envs or '无')
PY
