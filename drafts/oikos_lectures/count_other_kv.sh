#!/bin/bash
# 其他候选用户库的键数量/前缀
set -uo pipefail
ENVF=/Users/brianw/projects/roomcraft/yiqisheji/.env
T=$(grep '^CLOUDFLARE_API_TOKEN=' "$ENVF" | cut -d= -f2- | tr -d '"'"'"'')
A=$(grep '^CLOUDFLARE_ACCOUNT_ID=' "$ENVF" | cut -d= -f2- | tr -d '"'"'"'')
H=(-H "Authorization: Bearer $T" -s -m 30)
for pair in "vocab-arcade-USERS:d8dc89f5052e472c9c328276f5130339" "yiqisheji-studio-AUTH:654f09bd5e264fd98d3412ff350592f7" "cf:44929bc6bfc04cb2a91ea128886b2998"; do
  TITLE=${pair%%:*}; ID=${pair##*:}
  curl "${H[@]}" "https://api.cloudflare.com/client/v4/accounts/$A/storage/kv/namespaces/$ID/keys?limit=1000" > /tmp/kk.json
  python3 - "$TITLE" <<'PY'
import json, sys
t = sys.argv[1]
try:
    d = json.load(open('/tmp/kk.json'))
    ks = [k['name'] for k in (d.get('result') or [])]
    from collections import Counter
    pref = Counter((k.split(':')[0] + ':' if ':' in k else '(无前缀)') for k in ks)
    print('%-26s 键数 %4d  前缀分布 %s' % (t, len(ks), dict(pref.most_common(5))))
    for k in ks[:8]:
        print('      ', k)
except Exception as e:
    print(t, '读取失败', e)
PY
done
