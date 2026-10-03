#!/usr/bin/env python3
"""检查 image_plan 各目标页的版式结构，为插入做准备。"""
import json
import pathlib
import re

SL = pathlib.Path('/Users/brianw/projects/brian-site/brianinchrist/organicchurch/library/oikos_church/lectures/slides')
plan = json.loads(pathlib.Path('/Users/brianw/projects/brian-site/drafts/oikos_lectures/image_plan.json').read_text(encoding='utf-8'))

for x in plan['images']:
    t = (SL / f"lecture-{x['lecture']}.html").read_text(encoding='utf-8')
    i = t.find(f'data-title="{x["slide_title"]}"')
    s = t.rfind('<section class="slide', 0, i)
    e = t.find('</section>', i) + 10
    page = t[s:e]
    classes = re.findall(r'<(div|p|span|aside|h1|h2|h3)\s+class="([^"]*)"', page)
    top = [c for _, c in classes[:6]]
    has = {
        'g-fig': 'g-fig' in page,
        'stack': 'class="stack"' in page,
        'grid-cols': (re.search(r'grid-template-columns:([^"]*)', page) or [None, '-'])[1],
        'fig_r': bool(re.search(r'<div class="fig r">', page)),
        'fig_other': bool(re.search(r'<div class="fig[^"]*">(?!\s*<svg)', page)),
        'svg_count': page.count('<svg'),
        'cards': page.count('class="card'),
        'kicker': page.count('class="kicker'),
        'body_p': page.count('class="body'),
        'chars': len(re.findall(r'[\u4e00-\u9fff]', page)),
    }
    print(f"{x['id']:<26} slot={x['slot']:<5} replace={x['replace_svg']} | {x['slide_title']}")
    print(f"     前几个 class: {top}")
    print(f"     {has}")
