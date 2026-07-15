#!/usr/bin/env python3
"""Build courseware metadata by parsing the lordship gospel book2 TOC and chapter files.

This script reads lordship_gospel/book2/index.html, extracts the table of
contents and each linked chapter's title/kicker, and writes the resulting JSON
to lordship_gospel/courseware/assets/data/courseware.json.

Run from anywhere:
    python brianinchrist/organicchurch/books/lordship_gospel/courseware/tools/build_courseware.py
"""

import copy
import json
import os
import re
from collections import Counter
from pathlib import Path

from bs4 import BeautifulSoup, Tag


SCRIPTURE_RE = re.compile(
    r'(创世记|出埃及记|利未记|民数记|申命记|约书亚记|士师记|路得记|'
    r'撒母耳记上|撒母耳记下|列王纪上|列王纪下|历代志上|历代志下|'
    r'以斯拉记|尼希米记|以斯帖记|约伯记|诗篇|箴言|传道书|雅歌|'
    r'以赛亚书|耶利米书|耶利米哀歌|以西结书|但以理书|'
    r'何西阿书|约珥书|阿摩司书|俄巴底亚书|约拿书|弥迦书|那鸿书|'
    r'哈巴谷书|西番雅书|哈该书|撒迦利亚书|玛拉基书|'
    r'马太福音|马可福音|路加福音|约翰福音|使徒行传|'
    r'罗马书|哥林多前书|哥林多后书|加拉太书|以弗所书|腓立比书|'
    r'歌罗西书|帖撒罗尼迦前书|帖撒罗尼迦后书|提摩太前书|提摩太后书|'
    r'提多书|腓利门书|希伯来书|雅各书|彼得前书|彼得后书|'
    r'约翰一书|约翰二书|约翰三书|犹大书|启示录)'
    r'\s*\d+[:：]\d+([-\u2013\u2014]\d+)?'
)


def _get_body_text(soup: BeautifulSoup) -> BeautifulSoup | None:
    """Return the .body-text element, or None if not found."""
    return soup.select_one('.body-text')


def _first_paragraph_after_heading(soup, keyword: str) -> str:
    heading = soup.find(lambda t: t.name in ('h3', 'h4') and keyword in t.get_text())
    if heading:
        p = heading.find_next('p')
        return p.get_text(strip=True) if p else ''
    return ''


def extract_summary(soup: BeautifulSoup) -> str:
    """Extract the first paragraph after the '本章概要' heading."""
    return _first_paragraph_after_heading(soup, '本章概要')


def extract_outline(soup: BeautifulSoup) -> list[dict]:
    """Extract h2/h3/h4 headings inside .body-text as outline items.

    Skips the chapter epigraph (``.chapter-epigraph``) and any heading that
    appears before the first paragraph, so poetic lead headings are not
    treated as outline sections.
    """
    body = _get_body_text(soup)
    if not body:
        return []

    first_paragraph = body.find('p')
    items: list[dict] = []
    for h in body.find_all(['h2', 'h3', 'h4']):
        if 'chapter-epigraph' in h.get('class', []):
            continue
        if first_paragraph is not None and h.sourceline is not None and first_paragraph.sourceline is not None:
            if h.sourceline < first_paragraph.sourceline:
                continue
        items.append({'level': int(h.name[1]), 'text': h.get_text(strip=True)})
    return items


def extract_scriptures(soup: BeautifulSoup) -> list[str]:
    """Extract scripture references from the chapter body text."""
    body = _get_body_text(soup)
    if not body:
        return []
    text = body.get_text()
    refs = sorted({m.group(0) for m in SCRIPTURE_RE.finditer(text)})
    return refs


# Leading/trailing punctuation stripped from candidate key terms.
KEY_TERM_PUNCTUATION = (
    "()[]{}<>\"'`"  # ASCII
    "（）【】［］｛｝〈〉《》「」『』\""  # fullwidth
    "·•◆"  # other common wrappers
)

# Clause-like Chinese function words/particles. Filtering is intentionally
# aggressive: a few valid terms containing single characters such as "的" will
# be dropped in exchange for removing sentence fragments.
CLAUSE_WORDS = {
    '的', '是', '在', '了', '就', '都', '而', '但',
    '如果', '因为', '所以', '被', '把', '让', '使', '对', '从', '向', '为', '与', '和', '或', '及', '等',
    '这', '那', '他', '她', '它', '们', '我', '你',
    '要', '会', '能', '可以', '需要', '应该', '必须',
    '已经', '正在', '曾经', '没有', '不再',
    '开始', '成为', '出现', '发生', '产生', '导致', '造成', '引起', '带来', '使得',
    '由于', '随着', '通过', '根据', '按照', '关于', '对于', '至于', '除了',
    '尽管', '虽然', '但是', '然而', '因此', '于是', '从而', '进而', '反而', '何况', '况且',
    '即使', '即便', '哪怕', '只要', '只有', '无论', '不管', '不论',
    '不但', '不仅', '不只', '不光', '而且', '并且',
    '或者', '要么', '与其', '宁可', '宁愿', '不如', '不像',
    '如同', '好像', '似乎', '仿佛', '犹如', '譬如', '例如', '比如', '像是',
    '如何', '怎样', '是否', '什么', '怎么', '为何', '为什么', '多么', '几', '谁',
    '哪', '哪个', '哪些', '哪里', '何时', '何地', '何人', '何物',
}

# Low-value structural terms to drop.
LOW_VALUE_TERMS = {
    '第一', '第二', '第三', '第四', '第五', '第六', '第七', '第八', '第九', '第十',
    '首先', '其次', '再次', '最后', '一方面', '另一方面',
}


def extract_key_terms(soup: BeautifulSoup, top_n: int = 12) -> list[str]:
    """Extract the most frequently used strong text elements from .body-text.

    Filters out long or clause-like fragments, surrounding punctuation, and
    common structural terms before counting occurrences.
    """
    body = _get_body_text(soup)
    if not body:
        return []

    sentence_punctuation = '。，；！？、：…'
    terms = []
    for t in body.find_all('strong'):
        term = t.get_text(strip=True).strip(KEY_TERM_PUNCTUATION)
        if len(term) < 2 or len(term) > 12:
            continue
        if any(ch in term for ch in sentence_punctuation):
            continue
        if any(w in term for w in CLAUSE_WORDS):
            continue
        if term in LOW_VALUE_TERMS:
            continue
        if re.search(r'第[一二三四五六七八九十0-9]+', term):
            continue
        terms.append(term)

    return [term for term, _ in Counter(terms).most_common(top_n)]


CHAPTER_KEY_MAP = {
    '绪论': 'introduction',
    '承转章': 'bridging',
    '前言': 'preface',
    '关键术语简释': 'keywords',
    '导言': 'introduction',
    '结语': 'conclusion',
    '附录': 'appendix',
    '学习讨论手册': 'guide',
}

_CN_NUMS = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '十一': 11, '十二': 12, '十三': 13, '十四': 14,
    '十五': 15, '十六': 16, '十七': 17, '十八': 18,
}


def h3_to_chapter_key(text: str) -> str | None:
    """Map a guide.html h3 heading to the chapter id used in courseware.json."""
    text = text.strip()
    for key, val in CHAPTER_KEY_MAP.items():
        if text.startswith(key):
            return val
    m = re.match(r'第\s*([一二三四五六七八九十0-9]+)\s*章', text)
    if m:
        num = m.group(1)
        if num in _CN_NUMS:
            n = _CN_NUMS[num]
        else:
            try:
                n = int(num)
            except ValueError:
                return None
        return f'chapter{n:02d}'
    return None


def parse_guide_sections(guide_path: Path) -> dict[str, Tag]:
    """Parse guide.html into a dict keyed by chapter id."""
    text = guide_path.read_text(encoding='utf-8')
    soup = BeautifulSoup(text, 'html.parser')
    body = _get_body_text(soup)
    if not body:
        return {}

    sections: dict[str, Tag] = {}
    h3s = body.find_all('h3')
    for i, h3 in enumerate(h3s):
        key = h3_to_chapter_key(h3.get_text(strip=True))
        if key is None:
            continue
        next_h3 = h3s[i + 1] if i + 1 < len(h3s) else None
        section_tag = soup.new_tag('div')
        for sibling in h3.find_next_siblings():
            if sibling is next_h3:
                break
            if isinstance(sibling, Tag):
                section_tag.append(copy.copy(sibling))
        sections[key] = section_tag
    return sections


def extract_guide_summary(section_soup: Tag) -> str:
    """Extract the first paragraph after the '本章概要' heading."""
    return _first_paragraph_after_heading(section_soup, '本章概要')


def extract_guide_questions(section_soup: Tag) -> dict[str, list[str]]:
    """Extract guided/exploratory/practical questions from a guide section."""
    result = {'guided': [], 'exploratory': [], 'practical': []}
    current = None
    for el in section_soup.find_all(['h3', 'h4', 'p', 'ol']):
        text = el.get_text(strip=True)
        if el.name == 'p' and '引导性' in text:
            current = 'guided'
        elif el.name == 'p' and '探索性' in text:
            current = 'exploratory'
        elif el.name == 'h4' and ('实践挑战' in text or '实践' in text):
            current = 'practical'
        elif el.name in ('h3', 'h4'):
            current = None
        elif el.name == 'p' and current == 'practical':
            if text:
                result['practical'].append(text)
        elif el.name == 'ol' and current:
            for li in el.find_all('li'):
                q = li.get_text(strip=True)
                if q:
                    result[current].append(q)
            current = None
    return result


def merge_guide_data(courseware: dict, guide_sections: dict[str, Tag]) -> None:
    """Overwrite chapter summaries and attach questions from guide.html."""
    empty_questions = {'guided': [], 'exploratory': [], 'practical': []}
    for part in courseware['parts']:
        for ch in part['chapters']:
            section = guide_sections.get(ch['id'])
            if section is not None:
                ch['summary'] = extract_guide_summary(section)
                ch['questions'] = extract_guide_questions(section)
            else:
                ch['questions'] = empty_questions.copy()


LG_ROOT = Path(__file__).resolve().parents[2]
BOOK_DIR = LG_ROOT / "book2"
COURSEWARE_DIR = LG_ROOT / "courseware"
OUTPUT_PATH = COURSEWARE_DIR / "assets" / "data" / "courseware.json"
JS_OUTPUT_PATH = COURSEWARE_DIR / "assets" / "js" / "courseware-data.js"


def parse_toc(soup: BeautifulSoup) -> list[dict]:
    """Parse the cover TOC into a list of parts with their linked chapters."""
    toc = soup.select_one(".cover-toc")
    if not toc:
        raise ValueError("Could not find .cover-toc in index.html")

    parts: list[dict] = []
    current_part: dict | None = None

    for child in toc.find_all(class_=re.compile(r"^cover-(part-title|toc-item)$")):
        if "cover-part-title" in child.get("class", []):
            current_part = {
                "title": child.get_text(strip=True),
                "chapters": [],
            }
            parts.append(current_part)
        elif current_part is not None:
            href = child.get("href", "").strip()
            if not href:
                continue

            chapter_id = Path(href).stem
            current_part["chapters"].append({
                "id": chapter_id,
                "href": href,
            })

    return parts


def parse_chapter_metadata(chapter_id: str, href: str, fallback_part_title: str) -> dict:
    """Extract title and kicker from a chapter/front-matter HTML file."""
    chapter_path = BOOK_DIR / href
    try:
        chapter_text = chapter_path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise RuntimeError(f"Chapter file not found: {chapter_path}") from exc
    soup = BeautifulSoup(chapter_text, "html.parser")

    title_el = soup.select_one(".chapter-title")
    title = title_el.get_text(strip=True) if title_el else chapter_id

    kicker_el = soup.select_one(".chapter-kicker")
    kicker = kicker_el.get_text(strip=True) if kicker_el else fallback_part_title

    # Store the path relative to the courseware root so links resolve at runtime.
    relative_href = Path(os.path.relpath(chapter_path, COURSEWARE_DIR)).as_posix()

    return {
        "id": chapter_id,
        "title": title,
        "kicker": kicker,
        "href": relative_href,
        "summary": extract_summary(soup),
        "outline": extract_outline(soup),
        "scriptures": extract_scriptures(soup),
        "keyTerms": extract_key_terms(soup),
    }


def build_part(part: dict) -> dict:
    """Build a populated part from its TOC definition."""
    return {
        "title": part["title"],
        "chapters": [
            parse_chapter_metadata(ch["id"], ch["href"], part["title"])
            for ch in part["chapters"]
        ],
    }


def build_courseware() -> dict:
    """Build the full courseware data structure."""
    index_path = BOOK_DIR / "index.html"
    index_soup = BeautifulSoup(index_path.read_text(encoding="utf-8"), "html.parser")

    title_tag = index_soup.title
    base_title = title_tag.get_text(strip=True) if title_tag else "家教会的本体论革命"
    courseware_title = f"{base_title} · 互动课件"

    raw_parts = parse_toc(index_soup)

    courseware: dict = {
        "title": courseware_title,
        "parts": [build_part(part) for part in raw_parts],
    }

    guide_path = BOOK_DIR / "guide.html"
    guide_sections = parse_guide_sections(guide_path)
    merge_guide_data(courseware, guide_sections)

    return courseware


def write_courseware_js(courseware: dict) -> None:
    """Write courseware data as a JS file for file:// compatibility."""
    data = json.dumps(courseware, ensure_ascii=False, indent=2)
    js_content = f"window.COURSEWARE_DATA = Object.freeze({data});\n"
    JS_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    JS_OUTPUT_PATH.write_text(js_content, encoding="utf-8")
    print(f"Wrote {JS_OUTPUT_PATH}")


def main() -> None:
    courseware = build_courseware()

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(courseware, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    write_courseware_js(courseware)

    total_chapters = sum(len(part["chapters"]) for part in courseware["parts"])
    print(f"Wrote {OUTPUT_PATH}")
    print(f"  parts: {len(courseware['parts'])}")
    print(f"  chapters: {total_chapters}")


if __name__ == "__main__":
    main()
