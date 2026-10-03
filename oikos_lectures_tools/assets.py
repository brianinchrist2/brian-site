import math, os
OUT = "/Users/brianw/projects/brian-site/brianinchrist/organicchurch/library/oikos_church/lectures/slides/assets"
A, AI, O, T, M, F, BG, RULE, BORDER, Q = "#8A3517","#732A11","#4A6741","#241B11","#6A5C49","#7A6C55","#FAF6EC","#D9CDB4","#E2D8C3","#F1E8D3"
def f(x): return f"{x:.1f}".rstrip('0').rstrip('.')
def leaf(x, y, ang, L=46, W=13):
    # pointed leaf from base (x,y) along angle ang (deg)
    a = math.radians(ang); ca, sa = math.cos(a), math.sin(a)
    def P(u, v): return (x + u*ca - v*sa, y + u*sa + v*ca)
    p0 = P(0,0); tip = P(L,0); c1 = P(L*0.45, W); c2 = P(L*0.45, -W)
    mid1 = P(L*0.15,0); mid2 = P(L*0.8,0)
    d = f"M{f(p0[0])} {f(p0[1])}Q{f(c1[0])} {f(c1[1])} {f(tip[0])} {f(tip[1])}Q{f(c2[0])} {f(c2[1])} {f(p0[0])} {f(p0[1])}Z"
    rib = f"M{f(mid1[0])} {f(mid1[1])}L{f(mid2[0])} {f(mid2[1])}"
    return d, rib
def qbez(p0, p1, p2, t):
    return ((1-t)**2*p0[0] + 2*(1-t)*t*p1[0] + t*t*p2[0], (1-t)**2*p0[1] + 2*(1-t)*t*p1[1] + t*t*p2[1])
def qtan(p0,p1,p2,t):
    dx = 2*(1-t)*(p1[0]-p0[0]) + 2*t*(p2[0]-p1[0]); dy = 2*(1-t)*(p1[1]-p0[1]) + 2*t*(p2[1]-p1[1])
    return math.degrees(math.atan2(dy, dx))

# ---------- olive branch ----------
def olive_branch(draw=False, cls=False):
    p0, p1, p2 = (24, 168), (290, 72), (586, 118)
    leaves, ribs, olives = [], [], []
    n = 11
    for k in range(n):
        t = 0.08 + k*(0.86/(n-1))
        x, y = qbez(p0,p1,p2,t); ang = qtan(p0,p1,p2,t)
        side = 1 if k % 2 == 0 else -1
        L = 66 - abs(k-5)*2.4
        d, r = leaf(x, y, ang + side*(36 + (k%3)*7), L=L, W=L*0.28)
        leaves.append(d); ribs.append(r)
        if k % 3 == 1:
            d, r = leaf(x, y, ang - side*(40), L=L*0.8, W=L*0.22); leaves.append(d); ribs.append(r)
    for t, side in [(0.33, 1), (0.52, -1), (0.71, 1)]:
        x, y = qbez(p0,p1,p2,t); ang = math.radians(qtan(p0,p1,p2,t) + side*90)
        olives.append((x + 22*math.cos(ang), y + 22*math.sin(ang), x, y))
    # terminal leaf
    d, r = leaf(p2[0]-4, p2[1]-1, qtan(p0,p1,p2,1.0), L=52, W=14); leaves.append(d); ribs.append(r)
    stem = f"M{p0[0]} {p0[1]}Q{p1[0]} {p1[1]} {p2[0]} {p2[1]}"
    return stem, leaves, ribs, olives
stem, leaves, ribs, olives = olive_branch()
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="680" height="250" viewBox="0 0 680 250" fill="none" stroke-linecap="round" stroke-linejoin="round">',
       '<title>橄榄枝</title>',
       f'<path d="{stem}" stroke="{O}" stroke-width="3.5"/>']
for (ox, oy, sx, sy) in olives:
    svg.append(f'<path d="M{f(sx)} {f(sy)}L{f(ox)} {f(oy)}" stroke="{O}" stroke-width="2"/>')
    svg.append(f'<ellipse cx="{f(ox)}" cy="{f(oy)}" rx="10" ry="13" fill="{AI}" transform="rotate(20 {f(ox)} {f(oy)})"/>')
    svg.append(f'<ellipse cx="{f(ox-3)}" cy="{f(oy-4)}" rx="2.6" ry="3.6" fill="{BG}" opacity=".55"/>')
for d in leaves:
    svg.append(f'<path d="{d}" fill="{O}" fill-opacity=".16" stroke="{O}" stroke-width="2.5"/>')
for r in ribs:
    svg.append(f'<path d="{r}" stroke="{O}" stroke-width="1.5" opacity=".7"/>')
svg.append('</svg>')
open(os.path.join(OUT, "olive-branch.svg"), "w").write("\n".join(svg) + "\n")
# also print inline-able data for HTML use
open("/tmp/slidegen/olive_inline.txt","w").write(repr((stem, leaves, ribs, olives)))

# ---------- vine ----------
def spiral(cx, cy, r0, turns, ccw=1, steps=40):
    pts = []
    for i in range(steps+1):
        t = i/steps; a = ccw*t*turns*2*math.pi; r = r0*(1-t*0.85)
        pts.append((cx + r*math.cos(a), cy + r*math.sin(a)))
    return "M" + "L".join(f"{f(x)} {f(y)}" for x,y in pts)
def grape_leaf(cx, cy, s, rot):
    # stylised 5-lobed leaf as closed path of arcs
    pts = []
    for i in range(5):
        a = math.radians(-90 + i*72 - 36 + rot)
        pts.append(a)
    d = ""
    lobes = []
    for i in range(5):
        a0 = math.radians(rot - 90 + i*72)
        tip = (cx + s*math.cos(a0), cy + s*math.sin(a0))
        lobes.append(tip)
    # path: center -> around tips with notches
    path = []
    for i in range(5):
        a_tip = math.radians(rot - 90 + i*72); a_notch = math.radians(rot - 90 + i*72 + 36)
        tip = (cx + s*math.cos(a_tip), cy + s*math.sin(a_tip))
        notch = (cx + s*0.48*math.cos(a_notch), cy + s*0.48*math.sin(a_notch))
        c_a = (cx + s*0.95*math.cos(a_tip+0.33), cy + s*0.95*math.sin(a_tip+0.33))
        if i == 0: path.append(f"M{f(tip[0])} {f(tip[1])}")
        path.append(f"Q{f(c_a[0])} {f(c_a[1])} {f(notch[0])} {f(notch[1])}")
        a_next = math.radians(rot - 90 + (i+1)*72)
        nt = (cx + s*math.cos(a_next), cy + s*math.sin(a_next))
        c_b = (cx + s*0.95*math.cos(a_next-0.33), cy + s*0.95*math.sin(a_next-0.33))
        path.append(f"Q{f(c_b[0])} {f(c_b[1])} {f(nt[0])} {f(nt[1])}")
    path.append("Z")
    veins = "".join(f"M{f(cx)} {f(cy)}L{f(cx + s*0.8*math.cos(math.radians(rot-90+i*72)))} {f(cy + s*0.8*math.sin(math.radians(rot-90+i*72)))}" for i in range(5))
    return "".join(path), veins
vine = [f'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="300" viewBox="0 0 640 300" fill="none" stroke-linecap="round" stroke-linejoin="round">',
        '<title>葡萄枝</title>',
        f'<path d="M14 196C110 150 170 214 262 176S412 70 520 104S610 150 628 132" stroke="{O}" stroke-width="4"/>']
for (cx, cy, s, rot) in [(150, 150, 44, 200), (360, 120, 48, 20), (548, 78, 38, 160)]:
    d, v = grape_leaf(cx, cy, s, rot)
    vine.append(f'<path d="{d}" fill="{O}" fill-opacity=".14" stroke="{O}" stroke-width="2.5"/>')
    vine.append(f'<path d="{v}" stroke="{O}" stroke-width="1.5" opacity=".7"/>')
vine.append(f'<path d="{spiral(232, 214, 22, 1.6)}" stroke="{O}" stroke-width="2"/>')
vine.append(f'<path d="{spiral(452, 66, 20, 1.5, -1)}" stroke="{O}" stroke-width="2"/>')
# grape cluster hanging from ~ (300,170)
vine.append(f'<path d="M298 166L300 186" stroke="{O}" stroke-width="2.5"/>')
rows = [5,4,4,3,2,1]
y = 196
for i, n in enumerate(rows):
    x0 = 300 - (n-1)*9
    for j in range(n):
        vine.append(f'<circle cx="{f(x0 + j*18)}" cy="{y}" r="9.5" fill="{A}" fill-opacity="{0.78 if (i+j)%2==0 else 0.62}" stroke="{AI}" stroke-width="1.2"/>')
    y += 14
vine.append('</svg>')
open(os.path.join(OUT, "vine.svg"), "w").write("\n".join(vine) + "\n")

# ---------- veil band (幔子纹样) ----------
veil = f'''<svg xmlns="http://www.w3.org/2000/svg" width="120" height="48" viewBox="0 0 120 48" fill="none" stroke-linecap="round" stroke-linejoin="round">
<title>会幕幔子纹样</title>
<path d="M0 4.5H120M0 43.5H120" stroke="{O}" stroke-width="1.6"/>
<path d="M0 9H120M0 39H120" stroke="{A}" stroke-width="1.2" stroke-dasharray="1 5"/>
<path d="M30 12L48 24L30 36L12 24Z M90 12L108 24L90 36L72 24Z" stroke="{A}" stroke-width="2"/>
<path d="M30 17.5L39.5 24L30 30.5L20.5 24Z M90 17.5L99.5 24L90 30.5L80.5 24Z" fill="{O}" fill-opacity=".85"/>
<path d="M30 21.5L33.5 24L30 26.5L26.5 24Z M90 21.5L93.5 24L90 26.5L86.5 24Z" fill="{BG}"/>
<path d="M60 18.5c3.2 0 5.5 2.4 5.5 5.5s-2.3 5.5-5.5 5.5-5.5-2.4-5.5-5.5 2.3-5.5 5.5-5.5Z" fill="{A}"/>
<path d="M57.5 18.8L60 15.5L62.5 18.8" stroke="{A}" stroke-width="1.4"/>
<path d="M0 18.5c3.2 0 5.5 2.4 5.5 5.5S3.2 29.5 0 29.5M120 18.5c-3.2 0-5.5 2.4-5.5 5.5s2.3 5.5 5.5 5.5" fill="{A}"/>
<path d="M48 24H54M66 24H72M108 24H114M6 24H12" stroke="{O}" stroke-width="1.6"/>
</svg>
'''
open(os.path.join(OUT, "veil.svg"), "w").write(veil)
veil_v = f'''<svg xmlns="http://www.w3.org/2000/svg" width="48" height="120" viewBox="0 0 48 120">
<title>会幕幔子纹样（竖）</title>
<g transform="translate(48 0) rotate(90)">
''' + "\n".join(veil.splitlines()[2:-1]) + '''
</g>
</svg>
'''
open(os.path.join(OUT, "veil-v.svg"), "w").write(veil_v.replace('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="120" viewBox="0 0 48 120">','<svg xmlns="http://www.w3.org/2000/svg" width="48" height="120" viewBox="0 0 48 120" fill="none" stroke-linecap="round" stroke-linejoin="round">'))

# ---------- fleuron divider ----------
l1, r1 = leaf(96, 20, 200, L=40, W=10)
l2, r2 = leaf(96, 20, 160, L=40, W=10)
l3, r3 = leaf(144, 20, -20, L=40, W=10)
l4, r4 = leaf(144, 20, 20, L=40, W=10)
fl = f'''<svg xmlns="http://www.w3.org/2000/svg" width="240" height="40" viewBox="0 0 240 40" fill="none" stroke-linecap="round" stroke-linejoin="round">
<title>分隔饰纹</title>
<path d="M4 20H52M188 20H236" stroke="{RULE}" stroke-width="2"/>
<path d="{l1}{l2}{l3}{l4}" fill="{O}" fill-opacity=".18" stroke="{O}" stroke-width="2"/>
<path d="M120 8L132 20L120 32L108 20Z" stroke="{A}" stroke-width="2"/>
<path d="M120 14L126 20L120 26L114 20Z" fill="{A}"/>
<circle cx="100" cy="20" r="2.5" fill="{A}"/><circle cx="140" cy="20" r="2.5" fill="{A}"/>
</svg>
'''
open(os.path.join(OUT, "fleuron.svg"), "w").write(fl)

# ---------- wordmarks ----------
GREEK_FONT = "'EB Garamond', Palatino, 'Palatino Linotype', 'Times New Roman', serif"
def wm(name, greek, translit, art):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="520" height="300" viewBox="0 0 520 300" fill="none" stroke-linecap="round" stroke-linejoin="round">
<title>{greek} 字标</title>
<rect x="6" y="6" width="508" height="288" rx="10" stroke="{RULE}" stroke-width="2"/>
<rect x="16" y="16" width="488" height="268" rx="6" stroke="{BORDER}" stroke-width="1.5"/>
{art}
<text x="260" y="214" text-anchor="middle" font-family="{GREEK_FONT}" font-size="86" fill="{T}">{greek}</text>
<path d="M150 240H370" stroke="{A}" stroke-width="1.5"/>
<path d="M260 234L266 240L260 246L254 240Z" fill="{A}"/>
<text x="260" y="280" text-anchor="middle" font-family="{GREEK_FONT}" font-size="36" letter-spacing="6" fill="{F}">{translit}</text>
</svg>
'''
roof = f'<path d="M150 112L260 44L370 112" stroke="{A}" stroke-width="5"/><path d="M178 112V96M342 112V96" stroke="{A}" stroke-width="3"/><path d="M246 112V86Q260 72 274 86V112" stroke="{O}" stroke-width="3"/>'
rings = "".join(f'<circle cx="{cx}" cy="82" r="34" stroke="{c}" stroke-width="4"/>' for cx, c in [(206, O), (260, A), (314, O)])
key = (f'<path d="M150 104L260 50L370 104" stroke="{A}" stroke-width="4"/>'
       f'<circle cx="200" cy="112" r="18" stroke="{O}" stroke-width="4"/><circle cx="200" cy="112" r="6" fill="{O}"/>'
       f'<path d="M218 112H330M300 112V128M316 112V124M330 112V130" stroke="{O}" stroke-width="4"/>')
open(os.path.join(OUT, "wm-oikos.svg"), "w").write(wm("oikos", "οἶκος", "OIKOS", roof))
open(os.path.join(OUT, "wm-koinonia.svg"), "w").write(wm("koinonia", "κοινωνία", "KOINONIA", rings))
open(os.path.join(OUT, "wm-oikonomia.svg"), "w").write(wm("oikonomia", "οἰκονομία", "OIKONOMIA", key))
print("assets written")
