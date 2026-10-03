import pathlib, re, json
D = pathlib.Path('/Users/brianw/projects/brian-site/brianinchrist/organicchurch/library/oikos_church/manuscript')
tot = 0
rows = []
for f in sorted(D.glob('*.md')):
    t = f.read_text(encoding='utf-8')
    h3 = re.findall(r'^###\s+(.+)$', t, re.M)
    h2 = re.findall(r'^##\s+(.+)$', t, re.M)
    tot += len(h3)
    rows.append((f.name, len(h2), len(h3), h3[:6]))
for name, n2, n3, first in rows:
    print(f'{name[:42]:44s} H2={n2:2d} H3={n3:2d}  {first}')
print('H3 合计:', tot)
