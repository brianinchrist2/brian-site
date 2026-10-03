#!/usr/bin/env python3
"""把 src/*.html 模板展开成最终幻灯片（替换 {{fig:}} / {{icon:}} / {{tl:}} / {{check}} 占位符）。

用法：
  python3 build.py                 # 构建全部，写入成品目录（会覆盖！）
  python3 build.py --verify        # 只构建到临时目录并与成品逐字节比对，不写成品
  python3 build.py lecture-2.html  # 只构建指定文件

路径全部相对本文件解析，不再依赖 /tmp。
"""
import argparse
import difflib
import filecmp
import os
import pathlib
import re
import shutil
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
SRCDIR = HERE / "src"
OUT = (HERE / ".." / "brianinchrist" / "organicchurch" / "library" / "oikos_church"
       / "lectures" / "slides").resolve()

sys.path.insert(0, str(HERE))
import importlib
import figs
importlib.reload(figs)

KIND = {"open": "k-open", "teach": "k-teach", "act": "k-act", "talk": "k-talk", "close": "k-close"}
TL = {
 "L1": [("0:00","0:02","开场祷告","","open"),("0:02","0:06","定调","四句话 · 墙","open"),("0:06","0:08","开场画面","违章建筑","teach"),
        ("0:08","0:18","第一段","三种处境 · 三大误解","teach"),("0:18","0:28","第二段","三大病症","teach"),("0:28","0:30","现场互动","外壳与操作系统","act"),
        ("0:30","0:40","第三段","寻找蓝图","teach"),("0:40","0:46","第四段","补充，还是废掉","teach"),("0:46","0:55","小组讨论","三题选一","talk"),
        ("0:55","0:58","收束","收束句 · 课后操练","close"),("0:58","1:00","差遣祷告","","close")],
 "L2": [("0:00","0:04","开场","回顾 · 追问 · 定调","open"),("0:04","0:12","第一段","国度的天空","teach"),("0:12","0:22","第二段","Oikos","teach"),
        ("0:22","0:32","第三段","Koinonia","teach"),("0:29","0:31","现场互动","敞开缺乏","act"),("0:32","0:46","第四段","Oikonomia","teach"),
        ("0:46","0:55","小组讨论","三题选一","talk"),("0:55","1:00","收束与差遣","","close")],
 "L3": [("0:00","0:04","开场","回顾 · 追问 · 定调","open"),("0:04","0:12","第一段","救赎史的轨迹","teach"),("0:12","0:24","第二段","加法与乘法","teach"),
        ("0:24","0:33","第三段","国度的权能","teach"),("0:33","0:46","第四段","生命的传递","teach"),("0:37","0:39","现场互动","谁把信仰磨进你","act"),
        ("0:46","0:55","小组讨论","三题选一","talk"),("0:55","1:00","收束与差遣","","close")],
 "L4": [("0:00","0:03","开场","回顾 · 追问 · 定调","open"),("0:03","0:13","第一段","祭坛的转移","teach"),("0:13","0:25","第二段","餐桌与圆桌","teach"),
        ("0:25","0:34","第三段","孤立到联结","teach"),("0:34","0:41","第四段","落地路线图","teach"),("0:41","0:50","小组讨论","三题选一","talk"),
        ("0:50","0:57","第五段","结语与呼召","teach"),("0:57","1:00","差遣祷告","Maranatha","close")],
}


def mins(t):
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def timeline(key):
    rows = TL[key]
    out = ['<div class="tl r">', '<div class="tl-axis">' + "".join(
        f'<span style="--m:{m}">{m // 60}:{m % 60:02d}</span>' for m in (0, 15, 30, 45, 60)) + '</div>']
    for (a, b, nm, sub, k) in rows:
        s, e = mins(a), mins(b)
        out.append(f'<div class="tl-row"><span class="tl-time">{a}–{b}</span><span class="tl-name">{nm}{"<i>" + sub + "</i>" if sub else ""}</span>'
                   f'<span class="tl-track"><i class="tl-bar {KIND[k]}" style="--s:{s};--e:{e}"></i></span></div>')
    out.append(f'<div class="tl-cursor-lane" style="--rows:{len(rows)}"><i class="tl-cursor" style="--sweep:{len(rows) * 0.12 + 0.6:.2f}s"></i></div>')
    out.append('</div>')
    legend = ('<div class="tl-legend r"><span style="--c:var(--faint)">开场</span><span style="--c:var(--accent)">讲授</span>'
              '<span style="--c:var(--accent2)">现场互动</span><span style="--c:repeating-linear-gradient(45deg,var(--accent2) 0 6px,#5d7a53 6px 12px)">小组讨论</span><span style="--c:var(--text)">收束</span></div>')
    return "".join(out) + legend


def render(src: str) -> str:
    def rep(m):
        kind, arg = m.group(1), m.group(2)
        if kind == "fig":
            return eval("figs." + arg)
        if kind == "icon":
            return figs.icon(arg)
        if kind == "check":
            return figs.checkbox()
        if kind == "tl":
            return timeline(arg)
        raise ValueError(kind)
    return re.sub(r"\{\{(fig|icon|check|tl):?([^}]*)\}\}", rep, src)


def build(names, outdir: pathlib.Path):
    built = []
    for name in names:
        src = (SRCDIR / name).read_text(encoding="utf-8")
        html = render(src)
        (outdir / name).write_text(html, encoding="utf-8")
        built.append((name, len(html), html.count('class="slide')))
    return built


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*", default=None)
    ap.add_argument("--verify", action="store_true", help="只比对，不写成品")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    names = a.names or ["index.html", "lecture-1.html", "lecture-2.html", "lecture-3.html", "lecture-4.html"]
    outdir = pathlib.Path(a.out) if a.out else (pathlib.Path(tempfile.mkdtemp()) if a.verify else OUT)
    outdir.mkdir(parents=True, exist_ok=True)

    built = build(names, outdir)
    for name, n, s in built:
        print(f"built {name}  {n} bytes  {s} slide-ish")

    if a.verify:
        print(f"\n比对：{outdir}  vs  {OUT}")
        bad = 0
        for name, _, _ in built:
            new, cur = outdir / name, OUT / name
            if not cur.exists():
                print(f"  ✗ {name}: 成品不存在")
                bad += 1
                continue
            if filecmp.cmp(new, cur, shallow=False):
                print(f"  ✔ {name}: 完全一致")
            else:
                bad += 1
                d = list(difflib.unified_diff(
                    cur.read_text(encoding="utf-8").splitlines(),
                    new.read_text(encoding="utf-8").splitlines(),
                    fromfile="成品", tofile="重建", lineterm="", n=1))
                print(f"  ✗ {name}: 有差异（diff 行数 {len(d)}），前几处：")
                for line in d[2:14]:
                    print("      " + line[:150])
        shutil.rmtree(outdir, ignore_errors=True)
        sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
