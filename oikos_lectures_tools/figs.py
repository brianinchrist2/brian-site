# -*- coding: utf-8 -*-
"""Figure library for the lecture slides. Each function returns an inline SVG string
that uses the classes defined in slides/assets/deck.css."""
import math, random

def f(x):
    s = f"{x:.1f}"
    return s[:-2] if s.endswith(".0") else s

def pt(p): return f"{f(p[0])} {f(p[1])}"

def path(d, cls="ln", draw=True, extra=""):
    pl = ' pathLength="1"' if draw else ""
    dc = " draw" if draw else ""
    return f'<path d="{d}" class="{cls}{dc}"{pl}{extra}/>'

def text(x, y, s, cls="tx", anchor="middle", extra=""):
    return f'<text x="{f(x)}" y="{f(y)}" text-anchor="{anchor}" class="{cls}"{extra}>{s}</text>'

def svg(w, h, body, label, extra="", cls=""):
    c = f' class="{cls}"' if cls else ""
    return (f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{label}"{c}{extra}>'
            + "".join(body) + "</svg>")

def polar(cx, cy, r, deg):
    a = math.radians(deg)
    return (cx + r * math.cos(a), cy + r * math.sin(a))

def rounded_poly(V):
    """Smooth closed path through midpoints with vertices as Q controls."""
    n = len(V)
    mid = lambda a, b: ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    d = "M" + pt(mid(V[-1], V[0]))
    for i in range(n):
        d += "Q" + pt(V[i]) + " " + pt(mid(V[i], V[(i + 1) % n]))
    return d + "Z"

def circle_path(cx, cy, r):
    return (f"M{f(cx - r)} {f(cy)}A{f(r)} {f(r)} 0 1 1 {f(cx + r)} {f(cy)}"
            f"A{f(r)} {f(r)} 0 1 1 {f(cx - r)} {f(cy)}Z")

def leaf(x, y, ang, L=46, W=13):
    a = math.radians(ang); ca, sa = math.cos(a), math.sin(a)
    P = lambda u, v: (x + u * ca - v * sa, y + u * sa + v * ca)
    p0, tip, c1, c2 = P(0, 0), P(L, 0), P(L * .45, W), P(L * .45, -W)
    return f"M{pt(p0)}Q{pt(c1)} {pt(tip)}Q{pt(c2)} {pt(p0)}Z"

# ------------------------------------------------------------------ pappus seed
def seed(x, y, ang, L=46, fan=7, flen=20, cls="ln ln-m w2"):
    """A dandelion seed: stalk from (x,y) along ang, pappus fan at the end."""
    tip = polar(x, y, L, ang)
    d = f"M{pt((x, y))}L{pt(tip)}"
    for k in range(fan):
        a = ang - 50 + k * (100 / (fan - 1))
        e = polar(tip[0], tip[1], flen, a)
        d += f"M{pt(tip)}L{pt(e)}"
    return d

# ================================================================== 海星与蜘蛛
def starfish_spider():
    b = []
    # ---- spider (left)
    cx = 400
    legs = [((378, 230), (300, 150), (226, 196)), ((372, 252), (268, 222), (186, 290)),
            ((372, 278), (268, 302), (198, 392)), ((380, 302), (302, 384), (262, 474))]
    b.append('<g class="dim-late" style="--late:3.4s">')
    for a, k, e in legs:
        b.append(path(f"M{pt(a)}L{pt(k)}L{pt(e)}", "ln w4"))
        a2, k2, e2 = (2 * cx - a[0], a[1]), (2 * cx - k[0], k[1]), (2 * cx - e[0], e[1])
        b.append(path(f"M{pt(a2)}L{pt(k2)}L{pt(e2)}", "ln w4"))
    b.append(f'<ellipse cx="400" cy="322" rx="56" ry="74" class="ln f-s pop"/>')
    b.append(f'<path d="M376 300Q400 286 424 300M372 330Q400 316 428 330M378 360Q400 348 422 360" class="ln ln-f w2 fade"/>')
    b.append('</g>')
    b.append('<circle cx="400" cy="222" r="32" class="f-t pop"/>')
    b.append('<circle cx="390" cy="214" r="5" class="f-bg pop"/><circle cx="410" cy="214" r="5" class="f-bg pop"/>')
    b.append(path("M432 214L540 148", "ln ln-f w2"))
    b.append(text(552, 144, "中央神经", "tx tx-b fade", "start"))
    b.append(path("M330 262L470 238", "ln ln-a w5", extra=' style="--d:22"'))
    b.append(text(400, 176, "断头", "tx tx-a tx-b fade", "middle", ' style="--d:23"'))
    b.append(text(400, 566, "蜘蛛：头一断，全身瘫痪", "tx tx-s t36 tx-b fade"))
    # ---- starfish (right)
    sx, sy = 1130, 300
    R, r = 190, 70
    V = []
    cut_arm = 1  # arm at -18deg
    for k in range(5):
        a_tip = -90 + k * 72
        if k == cut_arm:
            V.append(polar(sx, sy, 104, a_tip - 8)); V.append(polar(sx, sy, 104, a_tip + 8))
        else:
            V.append(polar(sx, sy, R, a_tip))
        V.append(polar(sx, sy, r, a_tip + 36))
    b.append(f'<path d="{rounded_poly(V)}" class="ln ln-a w4 f-at draw" pathLength="1"/>')
    dots = []
    for k in range(5):
        if k == cut_arm: continue
        for rr in (54, 92, 128):
            p = polar(sx, sy, rr, -90 + k * 72)
            dots.append(f'<circle cx="{f(p[0])}" cy="{f(p[1])}" r="{7 if rr < 100 else 6}" class="f-a fade" opacity=".55"/>')
    b += dots
    b.append(f'<circle cx="{sx}" cy="{sy}" r="16" class="f-a fade" opacity=".7"/>')
    # cut line on the arm
    ca = -18
    c1, c2 = polar(sx, sy, 112, ca - 22), polar(sx, sy, 112, ca + 22)
    b.append(path(f"M{pt(c1)}L{pt(c2)}", "ln ln-m w2 dsh", draw=False))
    # detached arm grows a new body: one long arm (the old one) + four short buds
    off = 150
    ox, oy = polar(0, 0, off, ca)
    nb = polar(sx, sy, 112, ca)
    nb = (nb[0] + ox, nb[1] + oy)
    V2 = []
    for k in range(5):
        a_tip = ca + k * 72
        V2.append(polar(nb[0], nb[1], 124 if k == 0 else 62, a_tip))
        V2.append(polar(nb[0], nb[1], 24, a_tip + 36))
    b.append(f'<g class="fly" style="--fx:{f(-ox)}px;--fy:{f(-oy)}px;--d:12">'
             f'<path d="{rounded_poly(V2)}" class="ln ln-a w4 f-at"/>'
             + "".join(f'<circle cx="{f(polar(nb[0], nb[1], rr, ca)[0])}" cy="{f(polar(nb[0], nb[1], rr, ca)[1])}" r="6" class="f-a" opacity=".55"/>' for rr in (30, 60))
             + '</g>')
    b.append(f'<circle cx="{f(nb[0])}" cy="{f(nb[1])}" r="40" class="ln ln-o w2 dsh fade" style="--d:26"/>')
    b.append(text(nb[0] + 10, nb[1] + 120, "长出新的身体", "tx tx-o tx-b fade", "middle", ' style="--d:27"'))
    b.append(text(1180, 566, "海星：断肢再生", "tx tx-s t36 tx-b fade"))
    b.append(path("M800 70V520", "ln ln-r w2 dsh", draw=False))
    return svg(1620, 600, b, "蜘蛛与海星对照图", ' style="--dstep:90ms"')

# ================================================================== 卫星与蒲公英
def satellite_dandelion():
    b = []
    cx, cy = 390, 290
    b.append(f'<ellipse cx="{cx}" cy="{cy}" rx="262" ry="206" class="ln ln-r w2 dsh fade"/>')
    sats = [polar(cx, cy, 1, a) for a in range(0)]
    pos = []
    for k in range(6):
        a = -90 + k * 60 + 20
        p = (cx + 262 * math.cos(math.radians(a)), cy + 206 * math.sin(math.radians(a)))
        pos.append(p)
    for p in pos:
        mx, my = (cx + p[0]) / 2, (cy + p[1]) / 2
        nx, ny = -(p[1] - cy), (p[0] - cx)
        L = math.hypot(nx, ny); nx, ny = nx / L * 26, ny / L * 26
        b.append(path(f"M{cx} {cy}Q{f(mx + nx)} {f(my + ny)} {pt(p)}", "ln ln-a w4"))
    b.append(f'<circle cx="{cx}" cy="{cy}" r="88" class="ln ln-a w4 f-q pop"/>')
    b.append(text(cx, cy - 6, "中央", "tx tx-b t40 pop"))
    b.append(text(cx, cy + 38, "母堂", "tx tx-f pop"))
    for p in pos:
        b.append(f'<circle cx="{f(p[0])}" cy="{f(p[1])}" r="34" class="ln f-s pop"/>')
        b.append(f'<circle cx="{f(p[0])}" cy="{f(p[1])}" r="9" class="f-a pop" opacity=".6"/>')
    b.append(text(cx, 568, "卫星：延长的脐带", "tx tx-s t36 tx-b fade"))
    # ---- dandelion
    hx, hy = 1150, 250
    b.append(path(f"M{hx + 6} 580Q{hx + 30} 420 {hx} {hy + 16}", "ln ln-o w5"))
    b.append(path(f"M{hx + 12} 520Q{hx - 60} 500 {hx - 90} 450Q{hx - 30} 470 {hx + 14} 500", "ln ln-o w2 f-ot"))
    gaps = {2, 4, 5, 7}
    n = 24
    heads = []
    for k in range(n):
        a = -90 + k * (360 / n)
        if k in gaps:
            heads.append(a); continue
        st = polar(hx, hy, 18, a)
        b.append(path(seed(st[0], st[1], a, L=96, fan=7, flen=24), "ln ln-m w2"))
    b.append(f'<circle cx="{hx}" cy="{hy}" r="20" class="f-o pop"/>')
    flights = [(1390, 120, 18), (1470, 230, 32), (1540, 110, 12), (1420, 330, 40)]
    for (x, y, rot), a in zip(flights, heads):
        start = polar(hx, hy, 70, a)
        fx, fy = start[0] - x, start[1] - y
        b.append(f'<g class="fly" style="--fx:{f(fx)}px;--fy:{f(fy)}px;--fr:{f(a - rot)}deg">'
                 + path(seed(x, y, -90 + rot, L=52, fan=7, flen=22), "ln ln-m w2", draw=False)
                 + f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="4" ry="7" class="f-ai"/></g>')
    # landed seeds becoming new full plants
    b.append(path("M960 590H1590", "ln ln-r w2", draw=False))
    for i, gx in enumerate((1380, 1470, 1560)):
        h = 70 + i * 6
        b.append(f'<g class="pop" style="--d:{40 + i}">'
                 + path(f"M{gx} 588Q{gx + 6} {588 - h / 2} {gx} {588 - h}", "ln ln-o w4", draw=False)
                 + f'<circle cx="{gx}" cy="{588 - h}" r="7" class="f-o"/>'
                 + "".join(path(f"M{pt(polar(gx, 588 - h, 8, -90 + k * 30))}L{pt(polar(gx, 588 - h, 26, -90 + k * 30))}", "ln ln-m w1", draw=False) for k in range(12))
                 + "</g>")
    b.append(text(1200, 650, "蒲公英：每一颗种子落地，就是一个完整的生命", "tx tx-s t36 tx-b fade"))
    b.append(path("M800 60V560", "ln ln-r w2 dsh", draw=False))
    return svg(1620, 680, b, "卫星模式与蒲公英模式对照图", ' style="--dstep:70ms"')

# ================================================================== 剧场与客厅
def theater_livingroom():
    b = []
    # theatre
    b.append('<rect x="250" y="52" width="300" height="46" rx="8" class="ln ln-a w2 f-at fade"/>')
    b.append(text(400, 86, "讲台", "tx tx-a tx-b fade"))
    seats = []
    for r in range(6):
        for c in range(8):
            x = 232 + c * 48; y = 210 + r * 56
            seats.append((x, y))
    lines = []
    for (x, y) in seats:
        lines.append(f"M{x} {y - 12}L400 104")
    b.append(f'<path d="{"".join(lines)}" class="ln ln-f w1 draw" pathLength="1" opacity=".35" style="--dd:1.8s"/>')
    for (x, y) in seats:
        b.append(f'<g class="fade"><path d="M{x - 14} {y + 10}Q{x} {y - 6} {x + 14} {y + 10}" class="ln w2 f-s"/><circle cx="{x}" cy="{y - 10}" r="7" class="f-m"/></g>')
    b.append(text(400, 580, "剧场：所有视线朝向前方", "tx tx-s t36 tx-b fade"))
    b.append(text(400, 624, "公共距离：3.6 米以上", "tx fade"))
    # living room
    cx, cy, R = 1200, 320, 196
    pts = [polar(cx, cy, R, -90 + k * 36) for k in range(10)]
    d = ""
    for i in range(10):
        for j in range(i + 1, 10):
            d += f"M{pt(pts[i])}L{pt(pts[j])}"
    b.append(f'<circle cx="{cx}" cy="{cy}" r="112" class="ln ln-o w2 f-q pop"/>')
    b.append(f'<path d="{d}" class="ln ln-o w1 draw" pathLength="1" opacity=".45" style="--dd:2.4s;--d:3"/>')
    b.append(text(cx, cy + 12, "餐桌", "tx tx-o tx-b t36 pop"))
    for p in pts:
        b.append(f'<circle cx="{f(p[0])}" cy="{f(p[1])}" r="22" class="ln ln-o w4 f-bg pop"/>')
    b.append(text(cx, 580, "客厅：环形视线，彼此相对", "tx tx-s t36 tx-b fade"))
    b.append(text(cx, 624, "亲密距离：0–45 厘米", "tx fade"))
    b.append(path("M800 40V600", "ln ln-r w2 dsh", draw=False))
    return svg(1620, 650, b, "剧场式排布与客厅环形视线对照图", ' style="--dstep:60ms"')

# ================================================================== 殿 → 活石
def temple_trajectory():
    b = []
    curve = "M60 440C260 440 300 300 380 290S560 170 640 172S800 300 900 336S1080 440 1180 440L1570 440"
    b.append(f'<g transform="translate(0 56)">' + path(curve, "ln ln-r w5", extra=' style="--dd:2.4s"') + '</g>')
    st = [(110, 440), (380, 290), (640, 172), (900, 336), (1180, 440), (1480, 440)]
    names = ["伊甸", "会幕", "圣殿", "基督的身体", "活石的殿", "新城"]
    refs = ["创 3:8", "来 8:5", "耶 7:4", "约 2:19-21", "彼前 2:5", "启 21:22"]
    icons = []
    # tree
    x, y = st[0]
    icons.append(path(f"M{x} {y - 8}V{y - 70}M{x} {y - 40}L{x - 22} {y - 62}M{x} {y - 52}L{x + 20} {y - 74}", "ln ln-o w4")
                 + path(f"M{x - 52} {y - 92}Q{x - 60} {y - 150} {x - 12} {y - 152}Q{x + 6} {y - 186} {x + 40} {y - 160}Q{x + 74} {y - 140} {x + 52} {y - 104}Q{x + 40} {y - 76} {x} {y - 84}Q{x - 40} {y - 70} {x - 52} {y - 92}Z", "ln ln-o w4 f-ot"))
    # tent
    x, y = st[1]
    icons.append(path(f"M{x - 58} {y - 14}V{y - 74}L{x} {y - 118}L{x + 58} {y - 74}V{y - 14}", "ln ln-a w4 f-at")
                 + path(f"M{x - 30} {y - 14}V{y - 96}M{x} {y - 14}V{y - 118}M{x + 30} {y - 14}V{y - 96}", "ln ln-a w2")
                 + path(f"M{x - 76} {y - 14}H{x + 76}", "ln ln-a w4"))
    # temple
    x, y = st[2]
    icons.append(path(f"M{x - 70} {y - 70}L{x} {y - 112}L{x + 70} {y - 70}Z", "ln w4 f-s")
                 + path(f"M{x - 54} {y - 66}V{y - 20}M{x - 18} {y - 66}V{y - 20}M{x + 18} {y - 66}V{y - 20}M{x + 54} {y - 66}V{y - 20}", "ln w5")
                 + path(f"M{x - 78} {y - 16}H{x + 78}M{x - 88} {y - 6}H{x + 88}", "ln w4"))
    # body of Christ: cross with radiance
    x, y = st[3]
    rays = "".join(f"M{pt(polar(x, y - 74, 40, a))}L{pt(polar(x, y - 74, 58, a))}" for a in range(-160, 20, 30))
    icons.append(path(f"M{x} {y - 18}V{y - 128}M{x - 34} {y - 96}H{x + 34}", "ln ln-a w5") + path(rays, "ln ln-a w2"))
    # living stones: cluster forming a house
    x, y = st[4]
    stones = [(-60, -36), (-20, -36), (20, -36), (60, -36), (-40, -72), (0, -72), (40, -72), (-20, -108), (20, -108), (0, -142)]
    sp = ""
    for (dx, dy) in stones:
        sx, sy = x + dx, y + dy
        sp += (f"M{f(sx - 16)} {f(sy)}Q{f(sx - 18)} {f(sy - 16)} {f(sx - 2)} {f(sy - 15)}"
               f"Q{f(sx + 18)} {f(sy - 17)} {f(sx + 17)} {f(sy - 2)}Q{f(sx + 16)} {f(sy + 15)} {f(sx)} {f(sy + 14)}"
               f"Q{f(sx - 15)} {f(sy + 15)} {f(sx - 16)} {f(sy)}Z")
    icons.append(path(sp, "ln ln-o w2 f-ot"))
    # new city: walls with 3 gates per side, light in the centre, no temple
    x, y = st[5]
    s = 66; top = y - 150
    wall = f"M{x - s} {top}H{x + s}V{top + 2 * s}H{x - s}Z"
    gates = ""
    for i in (-1, 0, 1):
        gx = x + i * 38
        gates += f"M{gx - 8} {top}V{top + 12}H{gx + 8}V{top}M{gx - 8} {top + 2 * s}V{top + 2 * s - 12}H{gx + 8}V{top + 2 * s}"
        gy = top + s + i * 38
        gates += f"M{x - s} {gy - 8}H{x - s + 12}V{gy + 8}H{x - s}M{x + s} {gy - 8}H{x + s - 12}V{gy + 8}H{x + s}"
    light = "".join(f"M{pt(polar(x, top + s, 18, a))}L{pt(polar(x, top + s, 34, a))}" for a in range(0, 360, 45))
    icons.append(path(wall, "ln ln-a w4 f-q") + path(gates, "ln ln-a w2") + path(light, "ln ln-a w2")
                 + f'<circle cx="{x}" cy="{top + s}" r="11" class="f-a"/>')
    b.append('<g transform="translate(0 56)">')
    body_start = len(b)
    for i, ((x, y), nm, rf, ic) in enumerate(zip(st, names, refs, icons)):
        b.append(f'<g class="pop" style="--d:{2 + i * 2}">' + f'<circle cx="{x}" cy="{y}" r="11" class="f-a"/><circle cx="{x}" cy="{y}" r="20" class="ln ln-a w2"/></g>')
        b.append(f'<g style="--d:{3 + i * 2}" class="fade"><g transform="translate(0 -26)">{ic}</g></g>')
        ly = y + 64 if i not in (1, 2, 3) else y + 60
        b.append(text(x, ly, nm, "tx tx-b tx-s t36 fade", "middle", f' style="--d:{3 + i * 2}"'))
        b.append(text(x, ly + 40, rf, "tx tx-f fade", "middle", f' style="--d:{3 + i * 2}"'))
    # cracks
    for (x, y, l1, l2, lx, ly, d) in [(770, 252, "前 586", "被掳，会堂兴起", 784, 92, 9), (1040, 404, "AD 70", "圣殿被毁", 1040, 300, 11)]:
        b.append(path(f"M{x} {y - 34}L{x - 10} {y - 18}L{x + 8} {y - 6}L{x - 6} {y + 12}", "ln ln-a w4", extra=f' style="--d:{d}"'))
        b.append(text(lx, ly, l1, "tx tx-a tx-b fade", "middle" if x > 900 else "start", f' style="--d:{d}"'))
        b.append(text(lx, ly + 36, l2, "tx tx-a fade", "middle" if x > 900 else "start", f' style="--d:{d}"'))
    b.append('</g>')
    # brackets
    for (x1, x2, lab, d) in [(30, 200, "无殿", 1), (290, 730, "有殿", 5), (1100, 1580, "无殿", 13)]:
        yb = 40
        b.append(path(f"M{x1} {yb + 16}V{yb}H{x2}V{yb + 16}", "ln ln-m w2", extra=f' style="--d:{d}"'))
        b.append(f'<rect x="{(x1 + x2) / 2 - 50}" y="{yb - 22}" width="100" height="44" class="f-bg fade" style="--d:{d}"/>')
        b.append(text((x1 + x2) / 2, yb + 11, lab, "tx tx-b tx-s t32 fade", "middle", f' style="--d:{d}"'))
    return svg(1620, 620, b, "从无殿到有殿再到无殿：伊甸、会幕、圣殿、基督的身体、活石的殿、新城", ' style="--dstep:150ms"')

# ================================================================== 加法与乘法
def add_vs_mult():
    b = []
    x0, y0, x1, y1 = 110, 500, 900, 60
    b.append(path(f"M{x0} {y1 - 10}V{y0}H{x1 + 20}", "ln ln-m w2", draw=False))
    for g in range(11):
        x = x0 + g * (x1 - x0) / 10
        b.append(f'<path d="M{f(x)} {y0}V{y0 + 10}" class="ln ln-m w2"/>')
        if g % 2 == 0:
            b.append(text(x, y0 + 46, str(g), "tx tx-f"))
    b.append(text((x0 + x1) / 2, y0 + 92, "代", "tx tx-f"))
    ceil_y = y0 - 0.26 * (y0 - y1)
    b.append(f'<path d="M{x0} {f(ceil_y)}H{x1}" class="ln ln-a w2 dsh fade" style="--d:1"/>')
    b.append(text(x0 + 14, ceil_y - 16, "天花板：空间 · 预算 · 管理恩赐", "tx tx-a fade", "start", ' style="--d:1"'))
    pts = []
    for g in range(0, 101):
        t = g / 10
        y = y0 - (2 ** t) / 1024 * (y0 - y1)
        pts.append((x0 + t * (x1 - x0) / 10, y))
    d = "M" + "L".join(pt(p) for p in pts)
    # addition: rises then flattens under ceiling
    ad = []
    for g in range(0, 101):
        t = g / 10
        v = (ceil_y - y0) * (1 - math.exp(-t / 3.2)) * 0.98
        ad.append((x0 + t * (x1 - x0) / 10, y0 + v))
    b.append(path("M" + "L".join(pt(p) for p in ad), "ln ln-m w5", extra=' style="--dd:1.6s"'))
    b.append(text(x1 + 16, ad[-1][1] + 10, "加法", "tx tx-b t32 fade", "start"))
    b.append(path(d, "ln ln-a w7", extra=' style="--dd:2.2s"'))
    for g in range(11):
        x = x0 + g * (x1 - x0) / 10; y = y0 - (2 ** g) / 1024 * (y0 - y1)
        b.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{7 if g < 10 else 12}" class="f-a pop"/>')
    b.append(text(x1 - 26, y1 + 8, "2¹⁰ = 1024", "tx tx-a tx-b t48 tx-l pop", "end"))
    b.append(text(x1 + 16, y1 + 60, "乘法", "tx tx-a tx-b t32 fade", "start"))
    return svg(1000, 600, b, "加法增长与乘法倍增对照曲线", ' style="--dstep:70ms"')

# ================================================================== 保罗循环
def paul_cycle():
    b = []
    cx, cy, R = 500, 320, 196
    labels = [("① 播种与生养", "建立 Oikos 容器"), ("② 成全与建造", "植入治理基因"),
              ("③ 放手与离场", "验证有机生命力"), ("④ 网络与再生产", "启动倍增机制")]
    for k in range(4):
        a0 = -90 + k * 90 + 12; a1 = a0 + 66
        p0, p1 = polar(cx, cy, R, a0), polar(cx, cy, R, a1)
        b.append(path(f"M{pt(p0)}A{R} {R} 0 0 1 {pt(p1)}", "ln ln-a w5", extra=f' style="--d:{k * 3}"'))
        tip = polar(cx, cy, R, a1 + 8)
        l, r = polar(cx, cy, R - 16, a1 - 2), polar(cx, cy, R + 16, a1 - 2)
        b.append(f'<path d="M{pt(l)}L{pt(tip)}L{pt(r)}Z" class="f-a pop" style="--d:{k * 3 + 1}"/>')
    pos = [(cx, 62, "middle"), (cx + R + 48, cy - 8, "start"), (cx, cy + R + 86, "middle"), (cx - R - 48, cy - 8, "end")]
    for k, ((x, y, anc), (a, s)) in enumerate(zip(pos, labels)):
        b.append(text(x, y, a, "tx tx-b tx-s t40 fade", anc, f' style="--d:{k * 3 + 1}"'))
        b.append(text(x, y + 42, s, "tx fade", anc, f' style="--d:{k * 3 + 2}"'))
    b.append(f'<circle cx="{cx}" cy="{cy}" r="98" class="ln ln-o w2 f-ot pop"/>')
    b.append(text(cx, cy + 4, "Oikos", "tx tx-o tx-l t56 pop"))
    b.append(text(cx, cy + 46, "生命繁衍", "tx tx-o pop"))
    return svg(1000, 640, b, "保罗循环四阶段", ' style="--dstep:150ms"')

# ================================================================== 三层网络
def network():
    b = []
    random.seed(7)
    clusters = [(300, 330), (760, 210), (1220, 350)]
    hubs = [(560, 470, "安提阿"), (1010, 470, "以弗所")]
    # network links (draw first, behind)
    links = [(clusters[0], hubs[0][:2]), (clusters[1], hubs[0][:2]), (clusters[1], hubs[1][:2]), (clusters[2], hubs[1][:2]), (hubs[0][:2], hubs[1][:2])]
    for (a, c) in links:
        b.append(path(f"M{pt(a)}L{pt(c)}", "ln ln-a w2", extra=' style="--d:14"'))
    for i, (cx, cy) in enumerate(clusters):
        b.append(f'<ellipse cx="{cx}" cy="{cy}" rx="178" ry="128" class="ln ln-o w2 dsh f-bg fade" style="--d:{4 + i}"/>')
        n = 6 if i != 1 else 5
        for k in range(n):
            a = -90 + k * (360 / n) + i * 17
            ox, oy = cx + 108 * math.cos(math.radians(a)), cy + 74 * math.sin(math.radians(a))
            b.append(f'<g class="pop" style="--d:{k}"><circle cx="{f(ox)}" cy="{f(oy)}" r="27" class="ln ln-o w2 f-ot"/>'
                     + "".join(f'<circle cx="{f(ox + 11 * math.cos(math.radians(j * 72 - 90)))}" cy="{f(oy + 11 * math.sin(math.radians(j * 72 - 90)))}" r="4" class="f-o"/>' for j in range(5))
                     + "</g>")
        b.append(f'<circle cx="{cx}" cy="{cy}" r="10" class="f-o pop" style="--d:{4 + i}"/>')
    for (x, y, nm) in hubs:
        b.append(f'<circle cx="{x}" cy="{y}" r="30" class="ln ln-a w4 f-q pop" style="--d:15"/><circle cx="{x}" cy="{y}" r="11" class="f-a pop" style="--d:15"/>')
        b.append(text(x, y + 72, nm, "tx tx-a tx-b fade", "middle", ' style="--d:16"'))
    # travelling workers
    for (a, c) in links[:4]:
        mx, my = (a[0] * .45 + c[0] * .55), (a[1] * .45 + c[1] * .55)
        b.append(f'<path d="M{f(mx)} {f(my - 9)}L{f(mx + 9)} {f(my)}L{f(mx)} {f(my + 9)}L{f(mx - 9)} {f(my)}Z" class="f-a pop" style="--d:17"/>')
    # legend
    lx = 60
    b.append(f'<circle cx="{lx + 24}" cy="600" r="20" class="ln ln-o w2 f-ot"/>')
    b.append(text(lx + 60, 610, "Oikos：8–15 人", "tx tx-b", "start"))
    b.append(f'<ellipse cx="{lx + 520}" cy="600" rx="34" ry="22" class="ln ln-o w2 dsh"/>')
    b.append(text(lx + 570, 610, "属灵家族：5–10 个 Oikos", "tx tx-b", "start"))
    b.append(f'<circle cx="{lx + 1070}" cy="600" r="16" class="ln ln-a w4"/>')
    b.append(text(lx + 1100, 610, "使徒性网络：跨区域", "tx tx-b", "start"))
    return svg(1500, 640, b, "三层网络：Oikos、属灵家族、使徒性网络", ' style="--dstep:80ms"')

# ================================================================== 金字塔与渔网
def pyramid_net():
    b = []
    # pyramid
    ax, ay, base = 380, 70, 470
    tipcut = 150
    left, right = (ax - 260, base), (ax + 260, base)
    cut_l = (ax - 260 * (tipcut - ay) / (base - ay), tipcut)
    cut_r = (ax + 260 * (tipcut - ay) / (base - ay), tipcut)
    b.append(f'<g class="dim-late" style="--late:2.8s;--dim:.35">'
             + path(f"M{pt(cut_l)}L{pt(left)}H{right[0]}L{pt(cut_r)}Z", "ln w4 f-s")
             + "".join(path(f"M{f(ax - 260 * (yy - ay) / (base - ay))} {yy}H{f(ax + 260 * (yy - ay) / (base - ay))}", "ln ln-f w2") for yy in (230, 310, 390))
             + '</g>')
    b.append(f'<g class="slide-in" style="--late:2.2s;--sy:60px;--sx:0px">'
             f'<g transform="translate(40 -40) rotate(14 {ax} {ay})">' + f'<path d="M{ax} {ay}L{pt(cut_l)}H{f(cut_r[0])}Z" class="ln ln-a w4 f-at"/></g></g>')
    b.append(text(ax + 120, 60, "切掉塔尖", "tx tx-a tx-b fade", "start", ' style="--d:6"'))
    b.append(text(ax, 540, "金字塔：塔尖一断，整座坍塌", "tx tx-s t36 tx-b fade"))
    # net
    ox, oy, cols, rows, s = 950, 110, 9, 6, 62
    knots = {}
    for r in range(rows):
        for c in range(cols):
            x = ox + c * s + (s / 2 if r % 2 else 0); y = oy + r * s
            knots[(r, c)] = (x, y)
    cut = (2, 4)
    d = ""
    for (r, c), (x, y) in knots.items():
        nbrs = [(r, c + 1), (r + 1, c if r % 2 == 0 else c + 1), (r + 1, c - 1 if r % 2 == 0 else c)]
        for n in nbrs:
            if n in knots and cut not in ((r, c), n):
                d += f"M{f(x)} {f(y)}L{pt(knots[n])}"
    b.append(f'<path d="{d}" class="ln ln-o w2 draw" pathLength="1" style="--dd:2s"/>')
    for (k, (x, y)) in knots.items():
        if k == cut: continue
        b.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="5" class="f-o fade"/>')
    cx, cy = knots[cut]
    b.append(path(f"M{f(cx - 16)} {f(cy - 16)}L{f(cx + 16)} {f(cy + 16)}M{f(cx + 16)} {f(cy - 16)}L{f(cx - 16)} {f(cy + 16)}", "ln ln-a w5", extra=' style="--d:30"'))
    b.append(path(f"M{f(cx)} {f(cy - 22)}V{oy - 34}", "ln ln-a w2", extra=' style="--d:31"'))
    b.append(text(cx, oy - 46, "剪断一个结", "tx tx-a tx-b fade", "middle", ' style="--d:31"'))
    b.append(text(1220, 540, "渔网：其余的网仍然完好", "tx tx-s t36 tx-b fade"))
    b.append(path("M780 60V500", "ln ln-r w2 dsh", draw=False))
    return svg(1560, 580, b, "金字塔与渔网对照图", ' style="--dstep:60ms"')

# ================================================================== 神圣织锦
def tapestry():
    b = []
    x0, x1, y0, y1 = 300, 1000, 110, 470
    warps = [x0 + 30 + i * 64 for i in range(11)]
    wefts = [(150, "个人"), (250, "家庭"), (350, "群体"), (450, "对外")]
    wefts = [(y - 20, n) for y, n in wefts]
    for i, x in enumerate(warps):
        b.append(path(f"M{x} {y0 - 30}V{y1 + 10}", "ln ln-a w5", extra=f' style="--d:{i}"'))
    for j, (y, nm) in enumerate(wefts):
        segs = ""
        b.append(f'<rect x="{x0}" y="{y - 16}" width="{x1 - x0 + 20}" height="32" rx="6" class="f-ot fade" style="--d:{12 + j * 2}"/>')
        over = ""
        for i, x in enumerate(warps):
            if (i + j) % 2 == 0:
                over += f'<rect x="{x - 8}" y="{y - 16}" width="16" height="32" class="f-o"/>'
        b.append(f'<g class="fade" style="--d:{13 + j * 2}">{over}</g>')
        b.append(path(f"M{x0} {y - 16}H{x1 + 20}M{x0} {y + 16}H{x1 + 20}", "ln ln-o w2", extra=f' style="--d:{12 + j * 2}"'))
        b.append(text(x0 - 30, y + 11, nm, "tx tx-o tx-b t36 fade", "end", f' style="--d:{12 + j * 2}"'))
    b.append(text((x0 + x1) / 2, 46, "经线：爱与福音", "tx tx-a tx-b t36 fade"))
    b.append(text(x0 - 30, y1 + 40, "纬线", "tx tx-o fade", "end"))
    return svg(1100, 520, b, "神圣织锦：经线是爱与福音，纬线是个人、家庭、群体、对外四层生活规范", ' style="--dstep:70ms"')

# ================================================================== 同心合意
def waves():
    b = []
    def wave(x0, y, w, amp, ph, n=2.5):
        pts = []
        for k in range(121):
            t = k / 120
            pts.append((x0 + t * w, y + amp * math.sin(2 * math.pi * n * t + ph)))
        return "M" + "L".join(pt(p) for p in pts)
    random.seed(3)
    for i in range(5):
        b.append(path(wave(40, 90 + i * 62, 520, 18, random.uniform(0, 6.28), 2 + random.random()), "ln ln-f w2", extra=f' style="--d:{i}"'))
    b.append(text(300, 440, "同一地点，各自祷告", "tx tx-b fade"))
    for i in range(5):
        b.append(path(wave(700, 150 + i * 10, 520, 34, 0, 2.5), "ln ln-a w2", extra=f' style="--d:{6 + i}" opacity=".5"'))
    b.append(path(wave(700, 360, 520, 52, 0, 2.5), "ln ln-a w5", extra=' style="--d:12"'))
    b.append(text(960, 470, "同心合意：心意对齐的共振", "tx tx-a tx-b fade"))
    b.append(path("M630 60V420", "ln ln-r w2 dsh", draw=False))
    return svg(1260, 490, b, "各自祷告与同心合意的对照", ' style="--dstep:120ms"')

# ================================================================== 提后 2:2 四代
def four_generations():
    b = []
    rows = [("保罗", 1), ("提摩太", 1), ("忠心的人", 3), ("别人", 9)]
    ys = [70, 200, 330, 460]
    xs = []
    W0, W1 = 300, 1060
    for gi, (nm, n) in enumerate(rows):
        span = (W1 - W0)
        row = [W0 + span * (k + .5) / n for k in range(n)]
        xs.append(row)
    for gi in range(1, 4):
        par = xs[gi - 1]; ch = xs[gi]
        per = len(ch) // len(par)
        for k, x in enumerate(ch):
            px = par[min(k // per, len(par) - 1)]
            b.append(path(f"M{f(px)} {ys[gi - 1] + 24}C{f(px)} {ys[gi - 1] + 80} {f(x)} {ys[gi] - 80} {f(x)} {ys[gi] - 24}", "ln ln-o w2", extra=f' style="--d:{gi * 6}"'))
    for gi, (nm, n) in enumerate(rows):
        for x in xs[gi]:
            b.append(f'<circle cx="{f(x)}" cy="{ys[gi]}" r="{24 - gi * 3}" class="ln ln-o w4 f-ot pop" style="--d:{gi * 6 + 1}"/>')
        b.append(text(250, ys[gi] + 11, nm, "tx tx-b tx-s t36 fade", "end", f' style="--d:{gi * 6 + 1}"'))
    return svg(1100, 510, b, "提摩太后书 2:2 的四代传承", ' style="--dstep:110ms"')

# ================================================================== 河谷
def valleys():
    b = []
    V = [(150, 60), (600, 90), (1060, 120), (1470, 150)]
    peaks = [(375, 236), (830, 214), (1265, 232)]
    y0 = 420
    d = f"M0 330C60 400 80 {y0} {V[0][0] - V[0][1]} {y0}H{V[0][0] + V[0][1]}"
    for i, (px, py) in enumerate(peaks):
        xa = V[i][0] + V[i][1]; xb = V[i + 1][0] - V[i + 1][1]
        d += f"C{f(xa + (px - xa) * .5)} {y0} {f(px - (px - xa) * .45)} {py} {px} {py}"
        d += f"S{f(xb - (xb - px) * .5)} {y0} {xb} {y0}H{V[i + 1][0] + V[i + 1][1]}"
    d += "C1560 420 1580 380 1600 340"
    b.append(f'<path d="{d}V480H0Z" class="f-ot fade"/>')
    b.append(path(d, "ln ln-o w4", extra=' style="--dd:2s"'))
    def house(x, y, s=1.0, cls="ln ln-a w2 f-at"):
        return f'<path d="M{f(x - 16 * s)} {f(y)}V{f(y - 20 * s)}L{f(x)} {f(y - 36 * s)}L{f(x + 16 * s)} {f(y - 20 * s)}V{f(y)}Z" class="{cls}"/>'
    groups = [[(150, 416)], [(560, 416), (600, 416), (640, 416)],
              [(990, 416), (1035, 416), (1080, 416), (1125, 416), (1012, 384), (1058, 384), (1104, 384)]]
    dd = 1
    for hs in groups:
        b.append(f'<g class="pop" style="--d:{dd}">' + "".join(house(x, y) for x, y in hs) + '</g>'); dd += 3
    many = "".join(house(1360 + (k % 6) * 44, 416 - (k // 6) * 30, .8) for k in range(18))
    b.append(f'<g class="pop" style="--d:{dd}" opacity=".8">{many}</g>')
    for (x1, x2, top, d2) in [(170, 540, 120, 2), (660, 980, 100, 5), (1140, 1350, 120, 8)]:
        b.append(f'<path d="M{x1} 380Q{(x1 + x2) / 2} {top} {x2} 380" class="ln ln-a w2 dot fade" style="--d:{d2}"/>')
    for (x, lab, d2) in [(150, "先有家", 1), (600, "再有家族", 4), (1060, "再有部落", 7), (1470, "再有列国", 10)]:
        b.append(text(x, 528, lab, "tx tx-b tx-s t36 fade", "middle", f' style="--d:{d2}"'))
    return svg(1600, 560, b, "河谷画面：先有家，再有家族，再有部落，再有列国", ' style="--dstep:160ms"')

# ================================================================== 齿轮（钟表匠）
def gear_path(cx, cy, R, r, teeth):
    d = ""
    for k in range(teeth * 2):
        a0 = k * 180 / teeth
        rr = R if k % 2 == 0 else r
        p1 = polar(cx, cy, rr, a0 - 180 / teeth * .32)
        p2 = polar(cx, cy, rr, a0 + 180 / teeth * .32)
        d += ("M" if k == 0 else "L") + pt(p1) + "L" + pt(p2)
    return d + "Z"

def clock_father():
    b = []
    b.append(path(gear_path(250, 220, 120, 96, 12), "ln w4 f-s"))
    b.append(f'<circle cx="250" cy="220" r="38" class="ln w4 f-bg pop"/>')
    b.append(path(gear_path(410, 330, 70, 54, 9), "ln ln-m w4 f-s"))
    b.append(f'<circle cx="410" cy="330" r="20" class="ln ln-m w4 f-bg pop"/>')
    b.append(text(300, 470, "钟表匠：打开后盖，更换零件", "tx tx-b tx-s t32 fade"))
    # night: moon + window lamp
    b.append(path("M1050 70A70 70 0 1 0 1130 170A56 56 0 1 1 1050 70Z", "ln ln-a w4 f-at"))
    b.append(path("M760 380V240L860 170L960 240V380Z", "ln ln-o w4 f-ot"))
    b.append('<rect x="820" y="262" width="80" height="70" rx="6" class="f-q pop"/>')
    b.append(path("M860 262V332M820 297H900", "ln ln-o w2"))
    b.append('<circle cx="860" cy="297" r="16" class="f-a pop" opacity=".65"/>')
    b.append(text(860, 470, "父亲：守着发烧的孩子一整夜", "tx tx-b tx-s t32 fade"))
    return svg(1120, 500, b, "钟表匠与父亲", ' style="--dstep:140ms"')

# ================================================================== 小图标与其余图解
def icon(kind, size=120):
    """Small line icons, viewBox 0 0 120 120."""
    P = {
        "book": path("M60 34C46 24 28 22 14 26V94C28 90 46 92 60 102C74 92 92 90 106 94V26C92 22 74 24 60 34Z", "ln ln-a w4 f-at") + path("M60 34V102", "ln ln-a w2") + path("M26 44C36 42 44 43 52 47M26 58C36 56 44 57 52 61M68 47C76 43 84 42 94 44M68 61C76 57 84 56 94 58", "ln ln-a w2"),
        "flame": path("M60 104C36 104 26 86 30 68C34 52 48 46 50 26C64 36 70 50 66 64C74 60 78 52 78 44C90 56 94 72 90 84C86 96 76 104 60 104Z", "ln ln-a w4 f-at") + path("M60 102C50 100 46 92 48 84C50 76 58 74 60 64C68 72 72 82 70 90C68 98 64 102 60 102Z", "ln ln-a w2"),
        "steps": path("M26 96C20 90 22 78 30 76C38 74 42 84 38 92C36 98 30 100 26 96ZM24 66a5 5 0 1 0 0 .1M34 62a4 4 0 1 0 0 .1M42 66a4 4 0 1 0 0 .1", "ln ln-o w4 f-ot") + path("M76 64C70 58 72 46 80 44C88 42 92 52 88 60C86 66 80 68 76 64ZM74 34a5 5 0 1 0 0 .1M84 30a4 4 0 1 0 0 .1M92 34a4 4 0 1 0 0 .1", "ln ln-o w4 f-ot"),
        "gate": path("M18 104V40H102V104M18 40L60 16L102 40", "ln w4 f-s") + path("M42 104V70Q60 52 78 70V104", "ln ln-a w4 f-at"),
        "horn": path("M20 84C40 84 66 74 84 48L96 30C102 26 106 32 102 38L92 54C80 82 56 98 24 96C16 96 14 86 20 84Z", "ln ln-a w4 f-at") + path("M40 88L44 96M56 84L60 92M70 76L76 84", "ln ln-a w2"),
        "sheaf": path("M60 104V44M60 104L42 50M60 104L78 50M60 80L34 70M60 80L86 70", "ln ln-o w4") + path(leaf(60, 44, -90, 28, 9) + leaf(42, 50, -110, 26, 8) + leaf(78, 50, -70, 26, 8) + leaf(34, 70, -160, 22, 7) + leaf(86, 70, -20, 22, 7), "ln ln-o w2 f-ot") + path("M44 86H76", "ln ln-a w4"),
        "home": path("M18 60L60 24L102 60M28 52V104H92V52", "ln w4 f-s") + path("M44 104V78H76V104", "ln ln-a w4") + path("M40 66H80", "ln ln-a w2"),
        "lamp": path("M24 72C24 62 44 56 64 58C84 60 98 66 104 72C96 82 80 86 60 86C40 86 24 82 24 72Z", "ln ln-a w4 f-at") + path("M100 72H112M60 86V98M44 98H76", "ln ln-a w4") + path("M28 66C26 52 34 42 40 34C42 46 48 50 44 60", "ln ln-a w4 f-q"),
        "question": path("M20 30H100V82H58L38 100V82H20Z", "ln ln-a w4 f-at") + path("M50 46C50 38 70 38 70 46C70 52 60 54 60 62", "ln ln-a w4") + '<circle cx="60" cy="72" r="3.5" class="f-a"/>',
        "hourglass": path("M34 18H86M34 102H86M40 18C40 46 80 46 80 60C80 74 40 74 40 102M80 18C80 46 40 46 40 60C40 74 80 74 80 102", "ln ln-o w4") + path("M48 92Q60 80 72 92Z", "ln ln-o w2 f-ot"),
        "valve": path("M14 52H50M70 52H106M14 72H50M70 72H106", "ln w4") + path("M50 40V84M70 40V84", "ln w4") + path("M60 40V20M46 20H74", "ln ln-a w4") + '<circle cx="60" cy="62" r="10" class="f-a"/>',
        "scroll": path("M30 26H86C94 26 98 32 98 38V94H40C32 94 26 88 26 80V30", "ln w4 f-s") + path("M26 80C26 72 34 70 40 74V94M44 44H82M44 58H82M44 72H70", "ln ln-a w2"),
        "tent": path("M14 98L60 26L106 98Z", "ln ln-o w4 f-ot") + path("M60 26V98M46 98L60 70L74 98", "ln ln-o w2") + path("M84 30L104 14", "ln ln-a w4") + '<circle cx="82" cy="32" r="4" class="ln ln-a w2"/>',
        "bread": path("M20 66C20 50 38 40 60 40C82 40 100 50 100 66C100 72 96 76 90 76H30C24 76 20 72 20 66Z", "ln ln-a w4 f-at") + path("M40 50L46 62M58 46L62 60M76 50L74 62", "ln ln-a w2") + path("M16 84H104L94 104H26Z", "ln w4 f-s"),
        "column": path("M38 30H82M42 30V100M78 30V100M30 100H90M34 22H86", "ln w4") + path("M50 40L56 58L48 70L58 88", "ln ln-a w4"),
        "hand": path("M36 104V64C36 58 46 58 46 64V40C46 34 56 34 56 40V34C56 28 66 28 66 34V40C66 34 76 34 76 40V70L84 60C88 56 96 60 92 66L78 92C74 100 66 104 58 104Z", "ln ln-o w4 f-ot"),
        "door": path("M30 104V22H78V104", "ln w4") + path("M30 22L62 30V100L30 104Z", "ln ln-a w4 f-at") + '<circle cx="54" cy="66" r="3.5" class="f-a"/>' + path("M84 80H112M90 80V104M106 80V104", "ln ln-o w4"),
        "fire": path("M30 104H90V70H30Z", "ln w4 f-s") + path("M40 70V44H80V70", "ln w4") + path("M60 66C50 64 48 56 52 48C54 42 60 40 60 30C68 38 72 46 70 54C68 62 64 66 60 66Z", "ln ln-a w4 f-at") + path("M18 50C10 58 10 70 16 78M102 50C110 58 110 70 104 78", "ln ln-a w2"),
        "anchor": path("M60 24V100M44 38H76M24 72C24 92 44 100 60 100C76 100 96 92 96 72", "ln w4") + '<circle cx="60" cy="18" r="7" class="ln w4"/>',
    }
    return f'<svg width="{size}" height="{size}" viewBox="0 0 120 120" aria-hidden="true">{P[kind]}</svg>'

def checkbox():
    return ('<svg viewBox="0 0 58 58" aria-hidden="true"><rect x="3" y="3" width="52" height="52" rx="10" class="ln ln-o w4 f-ot"/>'
            + path("M15 30L25 40L44 18", "ln ln-a w5") + '</svg>')

def blueprint():
    b = []
    grid = "".join(f"M{x} 20V560" for x in range(40, 1101, 40)) + "".join(f"M20 {y}H1100" for y in range(40, 561, 40))
    b.append(f'<path d="{grid}" class="ln ln-o w1 fade" opacity=".18"/>')
    house = "M200 500V260L420 120L640 260V500Z"
    b.append(path(house, "ln ln-o w4"))
    b.append(path("M280 500V380H360V500M480 320H580V400H480Z", "ln ln-o w2"))
    b.append(path("M200 530H640M200 520V540M640 520V540", "ln ln-o w2"))
    b.append(text(420, 562, "原始设计", "tx tx-o fade"))
    b.append(path("M640 300H900V500H640", "ln ln-a w5"))
    b.append(f'<path d="M640 300H900V500H640Z" class="f-at fade" style="--d:5"/>')
    b.append(path("M700 360H840M700 410H840M700 460H800", "ln ln-a w2"))
    b.append(f'<g class="pop" style="--d:8"><circle cx="930" cy="190" r="74" class="ln ln-a w4"/><circle cx="930" cy="190" r="62" class="ln ln-a w2"/>'
             + text(930, 204, "违章", "tx tx-a tx-b t40") + '</g>')
    b.append(text(770, 548, "擅改的部分", "tx tx-a tx-b fade"))
    return svg(1120, 580, b, "违章建筑：擅改了原始蓝图的房子", ' style="--dstep:180ms"')

def funnel():
    b = []
    rows = [("先分清", "描述性叙述 ↔ 规范性主张", 60, 940), ("第一层", "显式教导优先于隐式事例", 170, 800),
            ("第二层", "反复性与普遍性指向规范", 280, 660), ("第三层", "救赎历史的轨迹", 390, 520)]
    cx = 480
    for i, (k, v, y, w) in enumerate(rows):
        w2 = rows[i + 1][3] if i + 1 < len(rows) else 380
        d = f"M{cx - w / 2} {y}H{cx + w / 2}L{cx + w2 / 2} {y + 96}H{cx - w2 / 2}Z"
        cls = "ln ln-o w2 f-ot" if i == 0 else "ln ln-a w4 f-at"
        b.append(f'<path d="{d}" class="{cls} fade" style="--d:{i * 2}"/>')
        b.append(text(cx - w2 / 2 + 24 if False else cx, y + 42, k, f"tx {'tx-o' if i == 0 else 'tx-a'} tx-b fade", "middle", f' style="--d:{i * 2}"'))
        b.append(text(cx, y + 80, v, "tx tx-b tx-s t32 fade", "middle", f' style="--d:{i * 2 + 1}"'))
    b.append(path(f"M{cx} 500V556", "ln ln-a w5", extra=' style="--d:9"'))
    b.append(f'<path d="M{cx - 14} 548L{cx} 570L{cx + 14} 548Z" class="f-a pop" style="--d:10"/>')
    b.append(text(cx + 30, 566, "规范", "tx tx-a tx-b t36 fade", "start", ' style="--d:10"'))
    return svg(960, 590, b, "三层判断标准：先分清描述与规范，再依次检验", ' style="--dstep:170ms"')

def trio(mode="divine"):
    """Triangle with Oikos / Koinonia / Oikonomia vertices. mode 'disease' adds the three ills."""
    b = []
    A, B, C = (480, 150), (170, 520), (790, 520)
    b.append(path(f"M{pt(A)}L{pt(B)}L{pt(C)}Z", "ln ln-a w4", extra=' style="--dd:1.8s"'))
    b.append(path(f"M{pt(A)}L{f((B[0] + C[0]) / 2)} {B[1]}M{pt(B)}L{f((A[0] + C[0]) / 2)} {f((A[1] + C[1]) / 2)}M{pt(C)}L{f((A[0] + B[0]) / 2)} {f((A[1] + B[1]) / 2)}", "ln ln-r w1", draw=False).replace('class="ln ln-r w1"', 'class="ln ln-r w1 fade" opacity=".7"'))
    verts = [(A, "οἶκος", "Oikos", "是什么"), (B, "κοινωνία", "Koinonia", "如何活"), (C, "οἰκονομία", "Oikonomia", "怎样运行")]
    ills = ["殿宇情结", "消费主义", "圣职阶级"]
    for i, ((x, y), g, l, q) in enumerate(verts):
        b.append(f'<circle cx="{x}" cy="{y}" r="86" class="ln ln-o w4 f-bg pop" style="--d:{2 + i}"/>')
        b.append(text(x, y + 12, g, "tx tx-gr t36 fade", "middle", f' style="--d:{2 + i}"'))
        dy = -104 if i == 0 else 130
        if mode == "divine":
            b.append(text(x, y + dy, f"{l} · {q}", "tx tx-o tx-b t32 fade", "middle", f' style="--d:{3 + i}"'))
        else:
            b.append(text(x, y + dy, f"{l} 的{['迷失', '枯竭', '扭曲'][i]}", "tx tx-o tx-b t32 fade", "middle", f' style="--d:{3 + i}"'))
            bx = x + (0 if i == 0 else (-10 if i == 1 else 10))
            by = y + (dy - 46 if i == 0 else dy + 44)
            b.append(text(bx, by, f"↑ {ills[i]}" if i else f"{ills[i]} ↓", "tx tx-a tx-b fade", "middle", f' style="--d:{6 + i}"'))
    if mode == "divine":
        b.append(text(480, 400, "教会", "tx tx-s tx-b t48 pop", "middle", ' style="--d:6"'))
    return svg(960, 720 if mode != "divine" else 680, b, "神圣三角：Oikos、Koinonia、Oikonomia", ' style="--dstep:150ms"')

def creature(kind, x, y, s=1.0, cls="ln w4 f-s"):
    if kind == "elephant":
        d = (f"M{f(x - 120 * s)} {f(y)}C{f(x - 130 * s)} {f(y - 110 * s)} {f(x + 20 * s)} {f(y - 140 * s)} {f(x + 70 * s)} {f(y - 96 * s)}"
             f"C{f(x + 110 * s)} {f(y - 130 * s)} {f(x + 170 * s)} {f(y - 100 * s)} {f(x + 160 * s)} {f(y - 40 * s)}"
             f"C{f(x + 158 * s)} {f(y)} {f(x + 150 * s)} {f(y + 40 * s)} {f(x + 170 * s)} {f(y + 70 * s)}"
             f"L{f(x + 154 * s)} {f(y + 74 * s)}C{f(x + 130 * s)} {f(y + 40 * s)} {f(x + 120 * s)} {f(y + 10 * s)} {f(x + 110 * s)} {f(y + 6 * s)}"
             f"L{f(x + 104 * s)} {f(y + 70 * s)}H{f(x + 74 * s)}L{f(x + 70 * s)} {f(y + 20 * s)}H{f(x - 60 * s)}L{f(x - 64 * s)} {f(y + 70 * s)}H{f(x - 94 * s)}"
             f"L{f(x - 98 * s)} {f(y + 20 * s)}C{f(x - 112 * s)} {f(y + 16 * s)} {f(x - 118 * s)} {f(y + 8 * s)} {f(x - 120 * s)} {f(y)}Z")
        ear = f"M{f(x + 66 * s)} {f(y - 86 * s)}C{f(x + 30 * s)} {f(y - 80 * s)} {f(x + 30 * s)} {f(y - 10 * s)} {f(x + 74 * s)} {f(y - 6 * s)}C{f(x + 96 * s)} {f(y - 30 * s)} {f(x + 90 * s)} {f(y - 70 * s)} {f(x + 66 * s)} {f(y - 86 * s)}Z"
        eye = f'<circle cx="{f(x + 122 * s)}" cy="{f(y - 66 * s)}" r="{f(5 * s)}" class="f-t"/>'
        tail = f"M{f(x - 120 * s)} {f(y - 30 * s)}Q{f(x - 140 * s)} {f(y - 10 * s)} {f(x - 136 * s)} {f(y + 20 * s)}"
        return f'<path d="{d}" class="{cls}"/><path d="{ear}" class="{cls}"/><path d="{tail}" class="ln w2"/>{eye}'
    if kind == "rabbit":
        body = f"M{f(x - 36 * s)} {f(y)}C{f(x - 44 * s)} {f(y - 40 * s)} {f(x - 10 * s)} {f(y - 56 * s)} {f(x + 14 * s)} {f(y - 44 * s)}C{f(x + 30 * s)} {f(y - 36 * s)} {f(x + 38 * s)} {f(y - 16 * s)} {f(x + 32 * s)} {f(y)}Z"
        head = f"M{f(x + 14 * s)} {f(y - 44 * s)}C{f(x + 14 * s)} {f(y - 66 * s)} {f(x + 48 * s)} {f(y - 70 * s)} {f(x + 50 * s)} {f(y - 50 * s)}C{f(x + 52 * s)} {f(y - 36 * s)} {f(x + 30 * s)} {f(y - 30 * s)} {f(x + 22 * s)} {f(y - 34 * s)}"
        ears = f"M{f(x + 26 * s)} {f(y - 62 * s)}C{f(x + 14 * s)} {f(y - 96 * s)} {f(x + 20 * s)} {f(y - 108 * s)} {f(x + 30 * s)} {f(y - 98 * s)}C{f(x + 36 * s)} {f(y - 88 * s)} {f(x + 36 * s)} {f(y - 74 * s)} {f(x + 34 * s)} {f(y - 64 * s)}M{f(x + 36 * s)} {f(y - 64 * s)}C{f(x + 36 * s)} {f(y - 96 * s)} {f(x + 48 * s)} {f(y - 104 * s)} {f(x + 54 * s)} {f(y - 92 * s)}C{f(x + 56 * s)} {f(y - 82 * s)} {f(x + 50 * s)} {f(y - 70 * s)} {f(x + 44 * s)} {f(y - 62 * s)}"
        tail = f'<circle cx="{f(x - 38 * s)}" cy="{f(y - 18 * s)}" r="{f(8 * s)}" class="f-bg ln w2"/>'
        eye = f'<circle cx="{f(x + 38 * s)}" cy="{f(y - 52 * s)}" r="{f(3 * s)}" class="f-t"/>'
        return f'<path d="{body}" class="{cls}"/><path d="{head}" class="{cls}"/><path d="{ears}" class="{cls}"/>{tail}{eye}'

def rabbit_elephant(mode="L1"):
    b = []
    b.append(path("M40 470H1540", "ln ln-r w2", draw=False))
    if mode == "L1":
        b.append(f'<g class="pop" style="--d:0">{creature("rabbit", 120, 470, 1.3)}</g>')
        b.append(text(300, 530, "兔子：繁殖力旺盛", "tx tx-b tx-s t36 fade"))
        b.append(path("M560 380C660 310 780 310 880 380", "ln ln-a w4", extra=' style="--d:2"'))
        b.append('<path d="M868 362L892 388L858 392Z" class="f-a pop" style="--d:3"/>')
        b.append(text(720, 300, "“进化”？", "tx tx-a tx-b t40 fade", "middle", ' style="--d:3"'))
        b.append(f'<g class="pop" style="--d:4">{creature("elephant", 1180, 358, 1.6)}</g>')
        b.append(text(1220, 530, "大象：体积更大，繁殖力被扼杀", "tx tx-b tx-s t36 fade", "middle", ' style="--d:5"'))
        for k in range(6):
            b.append(f'<g class="pop" style="--d:{6 + k}">{creature("rabbit", 250 + k * 52, 470, .55, "ln w2 f-ot")}</g>')
        return svg(1580, 560, b, "兔子“进化”成大象", ' style="--dstep:140ms"')
    # L2: visible vs hidden
    b.append(f'<g>{creature("elephant", 330, 358, 1.6)}</g>'.replace("<g>", '<g class="pop">'))
    b.append(text(380, 530, "大象：庞大，易被发现，繁殖周期长", "tx tx-b tx-s t36 fade"))
    grass = ""
    for k in range(40):
        x = 860 + k * 17
        h = 40 + (k * 37 % 30)
        grass += f"M{x} 470Q{x + 4} {470 - h / 2} {x + (6 if k % 2 else -4)} {470 - h}"
    for k, (x, sc) in enumerate([(930, .7), (1060, .6), (1180, .7), (1300, .55), (1410, .65), (1000, .5), (1250, .5)]):
        b.append(f'<g class="pop" style="--d:{2 + k}" opacity=".9">{creature("rabbit", x, 470 - (12 if k > 4 else 0), sc, "ln w2 f-ot")}</g>')
    b.append(path(grass, "ln ln-o w2", extra=' style="--d:9"'))
    b.append(text(1180, 530, "兔子：微小，几乎看不见，繁殖快", "tx tx-b tx-s t36 fade"))
    b.append(path("M790 160V500", "ln ln-r w2 dsh", draw=False))
    return svg(1580, 560, b, "大象与兔子", ' style="--dstep:120ms"')

def monitor():
    b = []
    b.append(path("M120 40H900Q930 40 930 70V470Q930 500 900 500H120Q90 500 90 470V70Q90 40 120 40Z", "ln w5 f-s"))
    b.append('<rect x="130" y="80" width="760" height="380" rx="8" class="f-t fade" opacity=".92"/>')
    for i, w in enumerate([420, 560, 300, 640, 480, 360, 520]):
        b.append(f'<rect x="170" y="{120 + i * 44}" width="{w}" height="16" rx="8" class="f-r fade" style="--d:{3 + i}" opacity=".5"/>')
    b.append(text(510, 432, "另一套操作系统", "tx tx-bg tx-b t36 fade", "middle", ' style="--d:10"'))
    b.append(path("M430 500L410 560H610L590 500", "ln w4"))
    b.append(f'<g class="pop" style="--d:2"><rect x="660" y="-6" width="230" height="74" rx="10" class="ln ln-a w4 f-q" transform="rotate(-6 775 31)"/>'
             + f'<text x="775" y="44" text-anchor="middle" class="tx tx-a tx-b t40" transform="rotate(-6 775 31)">新约</text></g>')
    return svg(1020, 580, b, "外壳贴着新约标签，里面换了操作系统", ' style="--dstep:110ms"')

def stones():
    b = []
    bricks = ""
    for r in range(5):
        for c in range(5 if r % 2 == 0 else 4):
            x = 60 + c * 84 + (42 if r % 2 else 0); y = 420 - r * 64
            bricks += f"M{x} {y}h76v-56h-76Z"
    b.append(path(bricks, "ln ln-f w2"))
    b.append(text(270, 500, "砖石 · 影儿", "tx tx-b tx-s t36 fade"))
    b.append(path("M520 240H700", "ln ln-a w5"))
    b.append('<path d="M694 222L724 240L694 258Z" class="f-a pop"/>')
    b.append(text(620, 210, "基督", "tx tx-a tx-b t36 fade"))
    random.seed(11)
    pos = [(830, 400), (920, 410), (1010, 400), (1100, 412), (870, 330), (960, 336), (1050, 330), (915, 262), (1005, 266), (960, 196)]
    for i, (x, y) in enumerate(pos):
        rx, ry = 40 + random.randint(-4, 6), 30 + random.randint(-3, 4)
        b.append(f'<g class="pop" style="--d:{3 + i}"><ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" class="ln ln-o w4 f-ot"/><circle cx="{x}" cy="{y}" r="6" class="f-a"/></g>')
    b.append(text(965, 500, "活石 · 实体", "tx tx-o tx-b tx-s t36 fade"))
    return svg(1180, 530, b, "从砖石到活石", ' style="--dstep:110ms"')

def river():
    b = []
    b.append('<rect x="120" y="360" width="240" height="40" class="ln w4 f-s fade"/><rect x="150" y="400" width="180" height="90" class="ln w4 f-s fade"/>')
    b.append(path("M190 360C170 300 200 250 240 240C280 250 310 300 290 360Z", "ln ln-a w4 f-at"))
    b.append(path("M222 240V210H258V240", "ln ln-a w4"))
    b.append(text(240, 540, "系统神学镜头：一座摆设", "tx tx-b tx-s t32 fade"))
    rv = "M520 120C620 80 700 160 760 220S900 300 960 260S1080 140 1160 200S1200 380 1120 430S980 480 1060 520"
    b.append(f'<path d="{rv}" class="ln ln-o fade" style="stroke-width:34;opacity:.18"/>')
    b.append(path(rv, "ln ln-o w5", extra=' style="--dd:2.2s"'))
    b.append(f'<path d="{rv}" class="ln ln-bg w2 flow" style="stroke-dasharray:14 26" />')
    stations = [(520, 120, "伊甸无殿"), (760, 220, "会幕、圣殿"), (960, 260, "基督的肉身"), (1160, 200, "教会"), (1060, 520, "新耶路撒冷无殿")]
    for i, (x, y, nm) in enumerate(stations):
        b.append(f'<circle cx="{x}" cy="{y}" r="12" class="f-a pop" style="--d:{2 + i}"/>')
        dx, anc = (0, "middle")
        ty = y - 28 if i != 4 else y + 50
        if i == 3: dx, anc, ty = 28, "start", y + 10
        b.append(text(x + dx, ty, nm, "tx tx-b fade", anc, f' style="--d:{2 + i}"'))
    b.append(text(860, 600, "圣经神学镜头：一条流动的河流", "tx tx-b tx-s t32 fade"))
    return svg(1360, 620, b, "摆设与河流：系统神学与圣经神学的两种镜头", ' style="--dstep:200ms"')

def displacement():
    b = []
    for k in range(6):
        x = 170 + k * 150
        b.append(f'<g class="pop" style="--d:{k}"><circle cx="{x}" cy="360" r="34" class="ln ln-o w4 f-ot"/>'
                 + path(f"M{x - 26} 300Q{x} 270 {x + 26} 300", "ln ln-o w2", draw=False) + '</g>')
    b.append(text(545, 450, "林前 14 章：一个一个地作先知讲道", "tx tx-o tx-b t32 fade", "middle", ' style="--d:6"'))
    b.append(f'<g class="slide-in" style="--late:1.9s;--sy:-200px">'
             '<rect x="90" y="270" width="910" height="130" rx="14" class="ln ln-a w5 f-q" style="fill-opacity:.9"/>'
             + text(545, 350, "单人讲道：看似只“增加了一个环节”", "tx tx-a tx-b t40") + '</g>')
    b.append(text(545, 520, "名义上是补充，实际上却是替代", "tx tx-a tx-b tx-s t40 fade", "middle", ' style="--d:16"'))
    return svg(1090, 560, b, "置换功能：名义上是补充，实际上却是替代", ' style="--dstep:120ms"')

def scaffold_house():
    b = []
    house = "M300 480V250L460 140L620 250V480Z"
    b.append(path(house, "ln ln-o w5 f-ot"))
    b.append('<rect x="420" y="330" width="80" height="80" rx="6" class="f-q pop" style="--d:3"/>')
    b.append('<circle cx="460" cy="370" r="18" class="f-a pop" style="--d:4" opacity=".65"/>')
    sc = "".join(f"M{x} 90V500" for x in (240, 380, 540, 680)) + "".join(f"M220 {y}H700" for y in (150, 260, 370, 480)) + "M240 150L380 260M380 150L240 260M540 260L680 370M680 260L540 370M240 370L380 480M540 150L680 260"
    b.append(f'<g class="dim-late" style="--late:2.4s;--dim:.12">' + path(sc, "ln ln-m w2", extra=' style="--d:1"') + '</g>')
    b.append(text(820, 210, "殿：中途的脚手架", "tx tx-m tx-b tx-s t36 fade", "start"))
    b.append(text(820, 400, "家：终极的居所", "tx tx-o tx-b tx-s t36 fade", "start", ' style="--d:5"'))
    return svg(1160, 540, b, "殿只是中途的脚手架，家才是终极的居所", ' style="--dstep:200ms"')

def promise_arc(a="申 15:4", a2="旧约律法中的应许", b_="徒 4:34", b2="五旬节之后的兑现", mid="约一千五百年"):
    b = []
    b.append(path("M200 330C360 60 920 60 1080 330", "ln ln-a w5", extra=' style="--dd:2s"'))
    b.append('<path d="M1060 306L1084 340L1092 300Z" class="f-a pop" style="--d:3"/>')
    b.append(text(640, 120, mid, "tx tx-a fade", "middle", ' style="--d:2"'))
    for (x, ref, sub, cls, d) in [(200, a, a2, "tx-m", 0), (1080, b_, b2, "tx-a", 4)]:
        b.append(f'<circle cx="{x}" cy="330" r="16" class="f-a pop" style="--d:{d}"/>')
        b.append(text(x, 400, ref, f"tx tx-b tx-l t56 {cls} fade", "middle", f' style="--d:{d}"'))
        b.append(text(x, 448, sub, "tx tx-b tx-s t32 fade", "middle", f' style="--d:{d + 1}"'))
    b.append(text(200, 490, "应许", "tx fade")); b.append(text(1080, 490, "实体兑现", "tx tx-a fade", "middle", ' style="--d:5"'))
    return svg(1280, 510, b, f"{a} 到 {b_}", ' style="--dstep:200ms"')

def collection_arc():
    b = []
    J = (820, 430)
    pts = {"马其顿": (150, 150), "亚该亚": (190, 340), "加拉太": (500, 190)}
    for i, (nm, (x, y)) in enumerate(pts.items()):
        b.append(path(f"M{x} {y}Q{(x + J[0]) / 2} {min(y, J[1]) - 170} {J[0]} {J[1]}", "ln ln-a w4", extra=f' style="--d:{2 + i}"'))
    for i, (nm, (x, y)) in enumerate(pts.items()):
        b.append(f'<circle cx="{x}" cy="{y}" r="15" class="f-o pop" style="--d:{i}"/>')
        b.append(text(x, y - 30, nm, "tx tx-b t32 fade", "middle", f' style="--d:{i}"'))
    b.append(f'<circle cx="{J[0]}" cy="{J[1]}" r="24" class="f-a pop" style="--d:3"/>')
    b.append(text(J[0], J[1] + 66, "耶路撒冷", "tx tx-a tx-b t36 fade", "middle", ' style="--d:3"'))
    return svg(960, 520, b, "保罗为耶路撒冷信徒募捐的路线：一道可见的弧线", ' style="--dstep:180ms"')

def philemon_steps():
    b = []
    steps = [("8–9", "宁可凭着爱心求你"), ("14", "出于甘心"), ("16", "身份翻转：奴仆成为弟兄"), ("17", "收纳他如同收纳我"), ("18–19", "都归在我的账上")]
    x0, y0, w, h = 80, 520, 300, 92
    d = f"M{x0} {y0}"
    for i in range(5):
        d += f"V{y0 - (i + 1) * h}H{x0 + (i + 1) * w}"
    b.append(path(d, "ln ln-a w5", extra=' style="--dd:2s"'))
    for i, (v, t) in enumerate(steps):
        x = x0 + i * w + 24; y = y0 - (i + 1) * h + 44
        b.append(text(x, y, f"第 {v} 节", "tx tx-a tx-b fade", "start", f' style="--d:{1 + i * 2}"'))
        b.append(text(x, y + 38, t, "tx tx-b tx-s t32 fade", "start", f' style="--d:{2 + i * 2}"'))
    return svg(1620, 540, b, "腓利门书的五个台阶", ' style="--dstep:200ms"')

def walls():
    b = []
    names = ["职业与收入", "学历与知识", "婚姻状况", "属灵成熟度", "神学立场"]
    for i, nm in enumerate(names):
        x = 70 + i * 300
        b.append(f'<g class="dim-late" style="--late:{2.6 + i * .15}s;--dim:.22">'
                 f'<rect x="{x}" y="70" width="230" height="130" rx="4" class="ln ln-a w2 f-at"/>'
                 + "".join(f'<path d="M{x} {y}H{x + 230}" class="ln ln-a w1"/>' for y in (102, 134, 166))
                 + "".join(f'<path d="M{x + xx} {y1}V{y1 + 32}" class="ln ln-a w1"/>' for (xx, y1) in ((60, 70), (150, 70), (100, 102), (190, 102), (50, 134), (140, 134), (90, 166), (180, 166)))
                 + '</g>')
        b.append(text(x + 115, 250, nm, "tx tx-b fade", "middle", f' style="--d:{i}"'))
    b.append(path("M760 290V350", "ln ln-a w4", extra=' style="--d:6"'))
    b.append(f'<g class="pop" style="--d:20"><ellipse cx="760" cy="440" rx="330" ry="80" class="ln ln-o w4 f-ot"/>'
             + text(760, 430, "一个新人", "tx tx-o tx-b tx-s t48") + text(760, 476, "καινὸς ἄνθρωπος", "tx tx-o tx-gr t32") + '</g>')
    return svg(1540, 540, b, "五道隔断墙与一个新人", ' style="--dstep:120ms"')

def courts():
    b = []
    b.append('<rect x="60" y="40" width="900" height="500" rx="6" class="ln w4 f-s fade"/>')
    b.append(text(110, 96, "外邦人院", "tx tx-b fade", "start"))
    b.append(f'<rect x="250" y="130" width="520" height="320" rx="4" class="ln ln-a w4 dsh fade" style="--d:2"/>')
    b.append(text(510, 118, "院墙警告：越界者“自负其死”", "tx tx-a tx-b fade", "middle", ' style="--d:3"'))
    b.append('<rect x="320" y="190" width="380" height="210" rx="4" class="ln w2 f-q fade" style="--d:4"/>')
    b.append('<rect x="560" y="230" width="110" height="130" rx="4" class="ln w4 f-at fade" style="--d:5"/>')
    b.append(text(420, 304, "以色列人的院", "tx fade", "middle", ' style="--d:4"'))
    b.append(text(615, 304, "圣所", "tx tx-b fade", "middle", ' style="--d:5"'))
    for i, (x, y) in enumerate([(120, 470), (170, 500), (880, 160), (900, 470), (840, 500), (140, 200)]):
        b.append(f'<g class="pop" style="--d:{6 + i}"><circle cx="{x}" cy="{y - 14}" r="9" class="f-m"/>' + f'<path d="M{x - 14} {y + 10}Q{x} {y - 8} {x + 14} {y + 10}" class="ln w2"/></g>')
    b.append(text(510, 590, "“万民祷告的殿”被改成集市", "tx tx-b tx-s t32 fade", "middle", ' style="--d:10"'))
    return svg(1020, 610, b, "圣殿的外邦人院与隔断墙", ' style="--dstep:150ms"')

def centri():
    b = []
    b.append(path("M120 420L300 170L480 420Z", "ln w4 f-s"))
    for a in range(0, 360, 45):
        if 30 < a < 150: continue
        p1, p2 = polar(300, 300, 280, a), polar(300, 300, 190, a)
        b.append(path(f"M{pt(p1)}L{pt(p2)}", "ln ln-m w4"))
        tip = polar(300, 300, 172, a); l, r = polar(300, 300, 196, a - 5), polar(300, 300, 196, a + 5)
        b.append(f'<path d="M{pt(l)}L{pt(tip)}L{pt(r)}Z" class="f-m pop"/>')
    b.append(text(300, 520, "旧约：向心 · 万民都要流归这山", "tx tx-b tx-s t32 fade"))
    b.append(text(300, 566, "赛 2:2", "tx tx-f fade"))
    cx, cy = 980, 300
    for k in range(5):
        x, y = polar(cx, cy, 60, -90 + k * 72)
        b.append(f'<path d="M{f(x - 18)} {f(y + 14)}V{f(y - 4)}L{f(x)} {f(y - 18)}L{f(x + 18)} {f(y - 4)}V{f(y + 14)}Z" class="ln ln-o w2 f-ot pop"/>')
    for a in range(0, 360, 45):
        p1, p2 = polar(cx, cy, 110, a), polar(cx, cy, 250, a)
        b.append(path(f"M{pt(p1)}L{pt(p2)}", "ln ln-a w4"))
        tip = polar(cx, cy, 268, a); l, r = polar(cx, cy, 244, a - 5), polar(cx, cy, 244, a + 5)
        b.append(f'<path d="M{pt(l)}L{pt(tip)}L{pt(r)}Z" class="f-a pop"/>')
    b.append(text(cx, 600, "新约：离心 · 往普天下去", "tx tx-a tx-b tx-s t32 fade"))
    b.append(text(cx, 640, "太 28:19", "tx tx-f fade"))
    return svg(1280, 660, b, "旧约向心与新约离心", ' style="--dstep:60ms"')

def twja():
    b = []
    C = [(400, 220, "圣灵论", "信任内住圣灵"), (300, 380, "基督论", "神圣的缺席"), (500, 380, "教会论", "即时的完整性")]
    for i, (x, y, a, s_) in enumerate(C):
        b.append(f'<circle cx="{x}" cy="{y}" r="150" class="ln {"ln-a" if i == 0 else "ln-o"} w4 draw" pathLength="1" style="fill:{"rgba(138,53,23,.07)" if i == 0 else "rgba(74,103,65,.08)"}"/>')
    labs = [(400, 30, 0), (120, 560, 1), (680, 560, 2)]
    for (x, y, i) in labs:
        b.append(text(x, y, C[i][2], "tx tx-b tx-s t36 fade", "middle", f' style="--d:{3 + i}"'))
        b.append(text(x, y + 38, C[i][3], "tx fade", "middle", f' style="--d:{3 + i}"'))
    b.append(text(400, 330, "一种姿态", "tx tx-a tx-b tx-s t32 pop", "middle", ' style="--d:7"'))
    return svg(800, 620, b, "TWJA 三基因", ' style="--dstep:180ms"')

def hall_circle():
    b = []
    b.append('<rect x="190" y="40" width="220" height="34" rx="6" class="f-at ln ln-a w2 fade"/>')
    dots = "".join(f'<circle cx="{60 + c * 24}" cy="{120 + r * 22}" r="6"/>' for r in range(18) for c in range(21))
    b.append(f'<g class="f-f fade" style="fill:var(--faint)" opacity=".6">{dots}</g>')
    b.append(text(300, 560, "一千人的礼拜堂：一人讲，众人听", "tx tx-b tx-s t32 fade"))
    cx, cy = 1000, 300
    pts = [polar(cx, cy, 170, -90 + k * 360 / 13) for k in range(13)]
    d = "".join(f"M{pt(pts[i])}L{pt(pts[j])}" for i in range(13) for j in range(i + 1, 13) if (j - i) in (1, 3, 5, 12))
    b.append(f'<path d="{d}" class="ln ln-o w1 draw" pathLength="1" opacity=".5" style="--dd:2s"/>')
    for p in pts:
        b.append(f'<circle cx="{f(p[0])}" cy="{f(p[1])}" r="16" class="ln ln-o w4 f-bg pop"/>')
    b.append(text(cx, 560, "十几个人的 Oikos：各人或有", "tx tx-o tx-b tx-s t32 fade"))
    return svg(1260, 590, b, "大礼拜堂与小型 Oikos 的参与结构", ' style="--dstep:40ms"')

def two_rails():
    b = []
    b.append(f'<circle cx="400" cy="300" r="70" class="ln ln-o w4 f-ot pop"/>')
    b.append(text(400, 312, "Oikos", "tx tx-o tx-l t40 pop"))
    b.append(path("M400 40V200M400 400V560", "ln ln-a w5"))
    b.append('<path d="M386 54L400 30L414 54Z" class="f-a pop"/><path d="M386 546L400 570L414 546Z" class="f-a pop"/>')
    b.append(path("M60 300H300M500 300H740", "ln ln-o w5"))
    b.append('<path d="M74 286L50 300L74 314Z" class="f-o pop"/><path d="M726 286L750 300L726 314Z" class="f-o pop"/>')
    b.append(text(430, 80, "纵向：跨区父老的教义校准", "tx tx-a tx-b", "start").replace('class="tx', 'class="fade tx'))
    b.append(text(430, 118, "（徒 15 章耶路撒冷会议）", "tx", "start").replace('class="tx', 'class="fade tx'))
    b.append(text(60, 350, "横向：父老相互问责", "tx tx-o tx-b", "start").replace('class="tx', 'class="fade tx'))
    return svg(800, 600, b, "双重护栏：纵向校准与横向问责", ' style="--dstep:150ms"')

def vessel():
    b = []
    cup = "M-90 -60H90L70 90Q60 120 0 120Q-60 120 -70 90Z"
    b.append(f'<g transform="translate(260 300)">' + path(cup, "ln w5 f-s") + f'<path d="M-84 -20H84L70 90Q60 120 0 120Q-60 120 -70 90Z" class="f-m dim-late" style="--late:1.4s;--dim:0" opacity=".45"/>' + '</g>')
    b.append(text(260, 490, "倒空", "tx tx-b tx-s t36 fade"))
    b.append(path("M430 300H590", "ln ln-a w5", extra=' style="--d:3"'))
    b.append('<path d="M584 284L612 300L584 316Z" class="f-a pop" style="--d:4"/>')
    b.append(f'<g transform="translate(780 300)">' + path(cup, "ln ln-o w5 f-bg") + f'<path d="M-86 -40H86L70 90Q60 120 0 120Q-60 120 -70 90Z" class="f-ot fade" style="--d:6"/>' + '</g>')
    rays = "".join(f"M{780 + dx} 150V{110 + abs(dx) // 4}" for dx in (-60, -30, 0, 30, 60))
    b.append(path(rays, "ln ln-o w4", extra=' style="--d:5"'))
    b.append(text(780, 490, "被充满", "tx tx-o tx-b tx-s t36 fade", "middle", ' style="--d:6"'))
    return svg(1040, 520, b, "倒空是被充满的前提", ' style="--dstep:200ms"')

def rock_water():
    b = []
    b.append(path("M90 420L130 300L220 250L330 270L390 360L370 420Z", "ln w5 f-s"))
    b.append(path("M230 252L250 320L220 360L260 420", "ln ln-a w4", extra=' style="--d:4"'))
    b.append(f'<g class="slide-in" style="--late:.8s;--sx:60px;--sy:-80px"><g transform="rotate(-30 330 170)">'
             '<rect x="300" y="140" width="110" height="56" rx="8" class="ln w4 f-m"/><path d="M355 196V320" class="ln w7"/></g></g>')
    b.append(text(240, 500, "岩石：一锤就碎", "tx tx-b tx-s t36 fade"))
    b.append(path("M680 230L700 430Q702 450 722 450H858Q878 450 880 430L900 230", "ln ln-o w5"))
    b.append(f'<path d="M688 300Q730 288 780 300T892 300L880 430Q878 450 858 450H722Q702 450 700 430Z" class="f-ot fade" style="--d:3"/>')
    b.append(path("M688 300Q730 288 780 300T892 300", "ln ln-o w2", extra=' style="--d:3"'))
    b.append(text(790, 500, "水：锤子打不碎", "tx tx-o tx-b tx-s t36 fade"))
    return svg(1000, 530, b, "岩石与一杯水", ' style="--dstep:150ms"')

def day_arc():
    b = []
    b.append(path("M120 420C300 80 900 80 1080 420", "ln ln-r w4 dsh", draw=False))
    b.append(path("M60 420H1140", "ln ln-r w2", draw=False))
    items = [(150, "坐在家里", "home"), (450, "行在路上", "steps"), (750, "躺下", "moon"), (1050, "起来", "sun")]
    for i, (x, nm, ic) in enumerate(items):
        y = 300 if i in (1, 2) else 380
        if ic == "home": g = path(f"M{x - 40} {y}V{y - 44}L{x} {y - 78}L{x + 40} {y - 44}V{y}Z", "ln ln-a w4 f-at") + path(f"M{x - 12} {y}V{y - 26}H{x + 12}V{y}", "ln ln-a w2")
        elif ic == "steps": g = path(f"M{x - 50} {y}Q{x} {y - 60} {x + 50} {y - 10}", "ln ln-o w4 dsh", draw=False) + f'<ellipse cx="{x - 30}" cy="{y - 28}" rx="9" ry="14" class="f-o" transform="rotate(-30 {x - 30} {y - 28})"/><ellipse cx="{x + 4}" cy="{y - 50}" rx="9" ry="14" class="f-o" transform="rotate(10 {x + 4} {y - 50})"/><ellipse cx="{x + 34}" cy="{y - 34}" rx="9" ry="14" class="f-o" transform="rotate(50 {x + 34} {y - 34})"/>'
        elif ic == "moon": g = path(f"M{x - 6} {y - 90}A44 44 0 1 0 {x + 40} {y - 30}A34 34 0 1 1 {x - 6} {y - 90}Z", "ln ln-a w4 f-at")
        else: g = f'<circle cx="{x}" cy="{y - 36}" r="26" class="ln ln-a w4 f-at"/>' + path("".join(f"M{pt(polar(x, y - 36, 38, a))}L{pt(polar(x, y - 36, 54, a))}" for a in range(-180, 1, 30)), "ln ln-a w4")
        b.append(f'<g class="pop" style="--d:{i * 2}">{g}</g>')
        b.append(text(x, 480, nm, "tx tx-b tx-s t36 fade", "middle", f' style="--d:{i * 2 + 1}"'))
    return svg(1200, 510, b, "坐在家里、行在路上、躺下、起来", ' style="--dstep:180ms"')

def seal():
    b = []
    b.append('<rect x="80" y="330" width="420" height="100" rx="40" class="ln ln-a w4 f-at fade"/>')
    b.append('<circle cx="290" cy="380" r="58" class="ln ln-a w4 f-q pop" style="--d:4"/>')
    b.append(path("M290 340L300 368L328 370L306 388L314 416L290 400L266 416L274 388L252 370L280 368Z", "ln ln-a w2", extra=' style="--d:5"'))
    b.append(f'<g class="slide-in" style="--late:.4s;--sy:-90px"><path d="M250 120H330V230Q330 260 350 270H230Q250 260 250 230Z" class="ln w4 f-s"/><rect x="236" y="270" width="108" height="40" rx="6" class="ln w4 f-m"/></g>')
    b.append(text(290, 480, "印章压在软蜡上留下的印记", "tx tx-b tx-s t32 fade", "middle", ' style="--d:6"'))
    return svg(580, 500, b, "typos：印章在蜡上留下的印记", ' style="--dstep:150ms"')

def chain3(labels=("委身", "信任", "敞开")):
    b = []
    for i, nm in enumerate(labels):
        x = 180 + i * 300
        b.append(f'<ellipse cx="{x}" cy="160" rx="150" ry="86" class="ln {"ln-a" if i % 2 else "ln-o"} w5 draw" pathLength="1" style="--d:{i * 2};fill:none"/>')
        b.append(text(x + (0 if i == 1 else (-30 if i == 0 else 30)), 172, nm, "tx tx-b tx-s t40 fade", "middle", f' style="--d:{i * 2 + 1}"'))
    return svg(1020, 290, b, "委身、信任、敞开三环相扣", ' style="--dstep:200ms"')

def clocks():
    b = []
    def clock(cx, cy, h, m, cls):
        ha = (h % 12 + m / 60) * 30 - 90; ma = m * 6 - 90
        ticks = "".join(f"M{pt(polar(cx, cy, 112, a))}L{pt(polar(cx, cy, 124, a))}" for a in range(0, 360, 30))
        return (f'<circle cx="{cx}" cy="{cy}" r="136" class="ln {cls} w5 f-bg"/>' + path(ticks, f"ln {cls} w4", draw=False)
                + path(f"M{cx} {cy}L{pt(polar(cx, cy, 70, ha))}", f"ln {cls} w7") + path(f"M{cx} {cy}L{pt(polar(cx, cy, 104, ma))}", f"ln {cls} w4")
                + f'<circle cx="{cx}" cy="{cy}" r="9" class="f-t"/>')
    b.append(f'<g class="pop dim-late" style="--late:2.2s;--dim:.4">{clock(260, 200, 11, 0, "ln-m")}</g>')
    b.append(text(260, 400, "周日上午十一点", "tx tx-b tx-s t36 fade"))
    b.append(text(260, 442, "不在这里看", "tx fade"))
    b.append(f'<g class="pop" style="--d:3">{clock(820, 200, 9, 0, "ln-a")}</g>')
    b.append(text(820, 400, "周一早上九点", "tx tx-a tx-b tx-s t36 fade", "middle", ' style="--d:4"'))
    b.append(text(820, 442, "要在这里看", "tx tx-a fade", "middle", ' style="--d:4"'))
    return svg(1080, 470, b, "周日上午十一点与周一早上九点", ' style="--dstep:200ms"')

def net_mend():
    b = []
    pts = {}
    for r in range(6):
        for c in range(9):
            pts[(r, c)] = (80 + c * 80 + (40 if r % 2 else 0), 70 + r * 70)
    hole = {(2, 3), (2, 4), (3, 3), (3, 4), (2, 5)}
    d = ""
    for (r, c), p in pts.items():
        for n in [(r, c + 1), (r + 1, c if r % 2 == 0 else c + 1), (r + 1, c - 1 if r % 2 == 0 else c)]:
            if n in pts and not ((r, c) in hole and n in hole):
                if (r, c) in hole or n in hole:
                    continue
                d += f"M{pt(p)}L{pt(pts[n])}"
    b.append(path(d, "ln ln-m w2", draw=False).replace('class="ln ln-m w2"', 'class="ln ln-m w2 fade"'))
    st = ""
    for (r, c) in hole:
        p = pts[(r, c)]
        for n in [(r, c + 1), (r + 1, c if r % 2 == 0 else c + 1), (r + 1, c - 1 if r % 2 == 0 else c), (r, c - 1), (r - 1, c if r % 2 else c - 1), (r - 1, c + 1 if r % 2 else c)]:
            if n in pts:
                st += f"M{pt(p)}L{pt(pts[n])}"
    b.append(path(st, "ln ln-a w4", extra=' style="--dd:2.4s;--d:2"'))
    b.append(text(440, 500, "修补渔网，使之能再打鱼", "tx tx-b tx-s t36 fade", "middle", ' style="--d:6"'))
    return svg(880, 530, b, "katartismos：修补渔网", ' style="--dstep:200ms"')

def table_wait():
    b = []
    b.append('<rect x="220" y="170" width="640" height="220" rx="110" class="ln ln-a w4 f-q pop"/>')
    for (x, y) in [(330, 250), (440, 300), (560, 250), (680, 310), (770, 250), (390, 330)]:
        b.append(f'<g class="pop"><circle cx="{x}" cy="{y}" r="26" class="ln ln-a w2 f-bg"/><circle cx="{x}" cy="{y}" r="12" class="ln ln-a w2"/></g>')
    seats = [(300, 120), (440, 110), (580, 110), (720, 120), (300, 440), (440, 450), (580, 450), (720, 440), (160, 280), (920, 280)]
    for i, (x, y) in enumerate(seats):
        empty = (i == 9)
        b.append(f'<g class="{"pop" if not empty else "fade"}"><circle cx="{x}" cy="{y}" r="30" class="ln {"ln-a dsh w4 f-at" if empty else "ln-o w4 f-ot"}"/></g>')
    b.append(text(1000, 270, "一个空位", "tx tx-a tx-b t36 fade", "start"))
    b.append(text(1000, 314, "大家饿着等", "tx tx-a t32 fade", "start"))
    return svg(1220, 520, b, "彼此等待：餐桌旁的一个空位", ' style="--dstep:90ms"')

def roadmap():
    b = []
    x0, x1, y = 80, 1520, 230
    W = (x1 - x0) / 24
    phases = [(0, 4, "预备与自我评估", "第 1–4 周", "ln-o", "f-ot"), (4, 12, "结构的转变", "5–12 周", "ln-a", "f-at"), (12, 24, "深化与扩展", "13–24 周", "ln-o", "f-ot")]
    for i, (a, b_, nm, wk, l, fcls) in enumerate(phases):
        xa, xb = x0 + a * W, x0 + b_ * W
        b.append(f'<rect x="{f(xa + 4)}" y="{y - 40}" width="{f(xb - xa - 8)}" height="80" rx="40" class="ln {l} w4 {fcls} pop" style="--d:{i * 3}"/>')
        b.append(text((xa + xb) / 2, y + 10, wk, "tx tx-b fade", "middle", f' style="--d:{i * 3 + 1}"'))
        b.append(text((xa + xb) / 2 + (40 if i == 0 else 0), y + 94, nm, "tx tx-b tx-s t36 fade", "middle", f' style="--d:{i * 3 + 1}"'))
    ticks = "".join(f"M{f(x0 + k * W)} {y - 70}V{y - 58}" for k in range(25))
    b.append(path(f"M{x0} {y - 64}H{x1}" + ticks, "ln ln-m w2", extra=' style="--dd:2s"'))
    return svg(1600, 360, b, "24 周三阶段路线图", ' style="--dstep:150ms"')

def hexagon(labels=("生命", "权力", "姊妹", "赋能", "网络", "方向")):
    b = []
    cx, cy, R = 330, 300, 230
    V = [polar(cx, cy, R, -90 + k * 60) for k in range(6)]
    b.append(path("M" + "L".join(pt(v) for v in V) + "Z", "ln ln-a w4", extra=' style="--dd:1.6s"'))
    b.append(path("".join(f"M{cx} {cy}L{pt(v)}" for v in V), "ln ln-r w2", draw=False).replace('class="ln ln-r w2"', 'class="ln ln-r w2 fade"'))
    for i, (v, nm) in enumerate(zip(V, labels)):
        b.append(f'<circle cx="{f(v[0])}" cy="{f(v[1])}" r="56" class="ln ln-o w4 f-bg pop" style="--d:{2 + i}"/>')
        b.append(text(v[0], v[1] + 13, nm, "tx tx-o tx-b tx-s t36 pop", "middle", f' style="--d:{2 + i}"'))
    b.append(text(cx, cy + 12, "每月", "tx tx-a tx-b tx-s t40 pop", "middle", ' style="--d:9"'))
    return svg(660, 600, b, "每月六问", ' style="--dstep:110ms"')

def materials():
    b = []
    b.append(path("M60 460H1180", "ln ln-r w2", draw=False))
    def bars(x, n, cls, label, d):
        g = ""
        k = 0
        for row in range(n):
            for c in range(n - row):
                bx = x + row * 30 + c * 60; by = 460 - (row + 1) * 30
                g += f'<path d="M{bx} {by + 30}L{bx + 8} {by}H{bx + 52}L{bx + 60} {by + 30}Z" class="ln w2 {cls}"/>'
        return f'<g class="pop" style="--d:{d}">{g}</g>' + text(x + n * 30, 510, label, "tx tx-b tx-s t32 fade", "middle", f' style="--d:{d}"')
    b.append(bars(80, 4, "f-a", "金", 0))
    b.append(bars(370, 3, "f-r", "银", 1))
    b.append(bars(600, 3, "f-at", "铜", 2))
    b.append(f'<g class="pop" style="--d:3">' + "".join(f'<rect x="{830 + c * 40}" y="{400 - r * 34}" width="34" height="60" rx="4" class="ln w2 f-m"/>' for r in range(2) for c in range(3 - r)) + '</g>')
    b.append(text(890, 510, "铁", "tx tx-b tx-s t32 fade", "middle", ' style="--d:3"'))
    logs = "".join(f'<g><rect x="{1000 + 0}" y="{430 - r * 44}" width="170" height="40" rx="20" class="ln ln-o w2 f-ot"/><circle cx="{1150}" cy="{450 - r * 44}" r="14" class="ln ln-o w2 f-bg"/></g>' for r in range(4))
    b.append(f'<g class="pop" style="--d:4">{logs}</g>')
    b.append(text(1085, 510, "木料", "tx tx-b tx-s t32 fade", "middle", ' style="--d:4"'))
    b.append(text(620, 90, "看不见圣殿建成，仍然预备工料", "tx tx-a tx-b tx-s t40 fade", "middle", ' style="--d:6"'))
    return svg(1240, 540, b, "大卫为圣殿预备的金银铜铁木料", ' style="--dstep:160ms"')

def dawn():
    b = []
    b.append(path("M0 420H1600", "ln ln-r w2", draw=False).replace('class="ln ln-r w2"', 'class="ln w2" style="stroke:rgba(226,216,195,.4)"'))
    b.append('<path d="M640 420A160 160 0 0 1 960 420Z" class="fade" style="fill:rgba(138,53,23,.55)"/>')
    rays = "".join(f"M{pt(polar(800, 420, 200, a))}L{pt(polar(800, 420, 300 + (a % 20) * 4, a))}" for a in range(-170, -9, 16))
    b.append(f'<path d="{rays}" class="ln draw" pathLength="1" style="stroke:rgba(243,236,219,.55);stroke-width:3;--dd:2.4s"/>')
    return svg(1600, 440, b, "黎明", ' style="--dstep:150ms"')

def olive(width=620, cls=""):
    """Inline olive branch that draws itself (same geometry family as assets/olive-branch.svg)."""
    p0, p1, p2 = (24, 168), (290, 72), (586, 118)
    def qb(t): return ((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1])
    def qt(t):
        dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]); dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1])
        return math.degrees(math.atan2(dy, dx))
    b = [path(f"M{p0[0]} {p0[1]}Q{p1[0]} {p1[1]} {p2[0]} {p2[1]}", "ln ln-o w4", extra=' style="--dd:1.6s"')]
    for k in range(11):
        t = 0.08 + k * (0.86 / 10); x, y = qb(t); ang = qt(t); side = 1 if k % 2 == 0 else -1
        L = 66 - abs(k - 5) * 2.4
        b.append(f'<path d="{leaf(x, y, ang + side * (36 + (k % 3) * 7), L, L * .28)}" class="ln ln-o w2 f-ot pop" style="--d:{4 + k}"/>')
        if k % 3 == 1:
            b.append(f'<path d="{leaf(x, y, ang - side * 40, L * .8, L * .22)}" class="ln ln-o w2 f-ot pop" style="--d:{4 + k}"/>')
    for t, side in [(0.33, 1), (0.52, -1), (0.71, 1)]:
        x, y = qb(t); a = math.radians(qt(t) + side * 90)
        ox, oy = x + 22 * math.cos(a), y + 22 * math.sin(a)
        b.append(f'<ellipse cx="{f(ox)}" cy="{f(oy)}" rx="10" ry="13" class="f-ai pop" style="--d:16"/>')
    return svg(680, 250, b, "橄榄枝", f' style="--dstep:90ms;width:{width}px"', cls)

def wordmark(kind):
    """Inline animated wordmark (static versions live in assets/wm-*.svg)."""
    b = ['<rect x="6" y="6" width="508" height="288" rx="10" class="ln ln-r w2 f-bg fade"/>',
         '<rect x="16" y="16" width="488" height="268" rx="6" class="ln w1 fade" style="stroke:var(--border)"/>']
    if kind == "oikos":
        greek, tr = "οἶκος", "OIKOS"
        b += [path("M150 112L260 44L370 112", "ln ln-a w5"), path("M178 112V96M342 112V96", "ln ln-a w4"), path("M246 112V86Q260 72 274 86V112", "ln ln-o w4")]
    elif kind == "koinonia":
        greek, tr = "κοινωνία", "KOINONIA"
        b += [f'<circle cx="{cx}" cy="82" r="34" class="ln {c} w4 draw" pathLength="1"/>' for cx, c in [(206, "ln-o"), (260, "ln-a"), (314, "ln-o")]]
    else:
        greek, tr = "οἰκονομία", "OIKONOMIA"
        b += [path("M150 104L260 50L370 104", "ln ln-a w4"), '<circle cx="200" cy="112" r="18" class="ln ln-o w4 draw" pathLength="1"/>',
              '<circle cx="200" cy="112" r="6" class="f-o pop"/>', path("M218 112H330M300 112V128M316 112V124M330 112V130", "ln ln-o w4")]
    b.append(f'<text x="260" y="214" text-anchor="middle" class="tx-gr fade" style="font-size:86px;fill:var(--text)">{greek}</text>')
    b.append(path("M150 240H370", "ln ln-a w2"))
    b.append('<path d="M260 234L266 240L260 246L254 240Z" class="f-a pop"/>')
    b.append(f'<text x="260" y="282" text-anchor="middle" class="tx-gr fade" style="font-size:40px;letter-spacing:6px;fill:var(--faint)">{tr}</text>')
    return svg(520, 300, b, f"{greek} 字标", ' style="--dstep:140ms"')
