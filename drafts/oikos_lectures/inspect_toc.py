import json, pathlib, re
D = pathlib.Path('/Users/brianw/projects/brian-site/brianinchrist/organicchurch/library/oikos_church')
m = json.load(open(D/'manifest.json'))
print('键:', list(m.keys()), '| stat:', m.get('stat'))
md = D/'manuscript'
tot = 0
for p in m['parts']:
    print('\n##', p.get('title') or p.get('name') or p.keys())
    for c in p.get('chapters', []):
        f = c.get('file') or c.get('href') or ''
        t = c.get('title') or c.get('name') or ''
        path = md/f
        h2 = h3 = 0
        if path.exists():
            txt = path.read_text(encoding='utf-8')
            h2 = len(re.findall(r'^## ', txt, re.M))
            h3 = len(re.findall(r'^### ', txt, re.M))
        tot += h2
        print(f'   {f:34s} {t:28s} H2={h2:2d} H3={h3:2d}')
print('\nH2 总数:', tot)
