#!/usr/bin/env python3
"""把成品里的配图块与版式改动同步回 src 模板，使 build.py 能逐字节复现成品。

原理（反展开）：成品 = src 里每个占位符被展开后的结果。所以对每个含图的页面，
先把成品该页的文本取出，再按顺序把「展开串」换回「占位符」，就得到等价的 src 文本。

用法：python3 sync_src.py [--dry]
"""
import argparse
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
SRCDIR = HERE / "src"
OUT = (HERE / ".." / "brianinchrist" / "organicchurch" / "library" / "oikos_church"
       / "lectures" / "slides").resolve()
sys.path.insert(0, str(HERE))
import build as B  # noqa: E402

PH = re.compile(r"\{\{(?:fig|icon|check|tl):?[^}]*\}\}")
SLIDE = re.compile(r'<section class="slide.*?</section>', re.S)

ap = argparse.ArgumentParser()
ap.add_argument("--dry", action="store_true")
a = ap.parse_args()


def split_slides(text):
    return [(m.start(), m.end(), m.group(0)) for m in SLIDE.finditer(text)]


def reverse_expand(final_slide, src_slide):
    """把成品页里的展开串换回占位符。

    若某个占位符的展开串在成品里找不到，而该页确实含配图 —— 说明那个 SVG 是
    被配图替换掉的（replace_svg 情况），占位符应直接丢弃；否则报错。
    """
    has_img = "assets/img/" in final_slide
    out, pos, n, dropped = final_slide, 0, 0, 0
    for m in PH.finditer(src_slide):
        ph = m.group(0)
        exp = B.render(ph)
        if not exp:
            raise SystemExit(f"展开为空：{ph}")
        i = out.find(exp, pos)
        if i < 0:
            if has_img:
                dropped += 1
                continue
            raise SystemExit(f"在成品里找不到展开串（{ph[:44]}…），长度 {len(exp)}")
        out = out[:i] + ph + out[i + len(exp):]
        pos = i + len(ph)
        n += 1
    return out, n, dropped


total = 0
for name in ["lecture-1.html", "lecture-2.html", "lecture-3.html", "lecture-4.html"]:
    src_text = (SRCDIR / name).read_text(encoding="utf-8")
    fin_text = (OUT / name).read_text(encoding="utf-8")
    s_slides, f_slides = split_slides(src_text), split_slides(fin_text)
    if len(s_slides) != len(f_slides):
        raise SystemExit(f"{name}: 页数不一致 src={len(s_slides)} 成品={len(f_slides)}")
    # 从后往前替换，避免位移影响
    changed = 0
    for si, fi in reversed(list(zip(s_slides, f_slides))):
        s_txt, f_txt = si[2], fi[2]
        st = re.search(r'data-title="([^"]*)"', s_txt)
        ft = re.search(r'data-title="([^"]*)"', f_txt)
        title = ft.group(1) if ft else "?"
        if not st or st.group(1) != title:
            raise SystemExit(f"{name}: 页序错位（{st and st.group(1)} vs {title}）")
        if "assets/img/" not in f_txt:
            continue                       # 该页没图，src 无需改动
        new_slide, nph, ndrop = reverse_expand(f_txt, s_txt)
        src_text = src_text[:si[0]] + new_slide + src_text[si[1]:]
        changed += 1
        total += 1
        print(f"  {name}  第「{title}」页：换回 {nph} 个占位符" + (f"，丢弃 {ndrop} 个已被配图取代的" if ndrop else ""))
    if changed and not a.dry:
        (SRCDIR / name).write_text(src_text, encoding="utf-8")
print(f"\n{'[dry] ' if a.dry else ''}同步了 {total} 个含图页面")
