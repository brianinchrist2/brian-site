#!/usr/bin/env python3
"""Convert organicchurch static post HTML pages to Markdown files.

Each `brianinchrist/organicchurch/posts/<id>.html` is a fully-rendered WordPress
post page. This script:

  1. Parses the page into a lightweight DOM tree (stdlib html.parser).
  2. Extracts frontmatter metadata (id/title/date/author/eyebrow/categories/
     featured_image/excerpt) from the article header.
  3. Converts the `article-content` body HTML to GitHub-flavored Markdown:
     strips inline `clamp()` font styles, `wp-block-*` class cruft, empty
     wrappers and HTML entities; preserves paragraphs, headings, lists,
     blockquotes, tables, images, audio/video controls (R2 absolute URLs),
     and turns dead WP iframe embeds + PDF files into plain links.
  4. Writes `posts/<id>.md` (frontmatter = single source of truth).
  5. Regenerates `posts/posts.json` from the MD frontmatter (keeps the field
     contract: {id, title, date, excerpt, categories, featured_image} + adds
     author/eyebrow; sorted by date descending).
  6. Emits `_redirects.posts` — one explicit 301 per post, mapping the old
     static `/posts/<id>.html` URL to the new `/posts/post.html?id=<id>`.

Pure stdlib, idempotent, deterministic output. Usage:

  python scripts/convert_posts.py --dry-run    # audit only, writes nothing
  python scripts/convert_posts.py              # full conversion
  python scripts/convert_posts.py --validate   # text-equivalence + image checks
"""

import html.parser
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORGANIC_DIR = ROOT / "brianinchrist" / "organicchurch"
POSTS_DIR = ORGANIC_DIR / "posts"
UPLOADS_DIR = ORGANIC_DIR / "uploads"
REDIRECTS_OUT = ROOT / "brianinchrist" / "_redirects.posts"


def resolve_asset(rel):
    """Resolve an asset path relative to the organicchurch root (e.g.
    'uploads/featured_5602_z2.jpg' or '../uploads/…') to an absolute disk path."""
    rel = rel.replace("\\", "/")
    if rel.startswith("../"):
        rel = rel[3:]
    if rel.startswith("/"):
        rel = rel.lstrip("/")
    return ORGANIC_DIR / rel

# ---------------------------------------------------------------------------
# DOM tree
# ---------------------------------------------------------------------------

VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}
STRIP_TAGS = {
    "script", "style", "canvas", "button", "template", "noscript", "form",
    "input", "select", "textarea", "label", "option", "iframe",
}
# Tags that are stripped entirely — script/style/canvas/button carry no
# visible prose worth keeping; iframe embeds are converted to links upstream.
BLOCK_TAGS = {
    "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote",
    "pre", "table", "figure", "div", "header", "main", "section", "footer",
    "nav", "hr", "audio", "video", "object", "aside", "address", "details",
    "dl", "dt", "dd", "img",
}
HEADING_LEVELS = {"h1": 1, "h2": 2, "h3": 3, "h4": 4, "h5": 5, "h6": 6}
# Inline wrappers whose inner formatting markers are pointless inside a heading.
TRANSPARENT_INLINE = {"span", "small", "mark", "i"}


class Node:
    """Lightweight element node. Text is stored as a ('text', data) child."""

    __slots__ = ("tag", "attrs", "children")

    def __init__(self, tag, attrs):
        self.tag = tag
        self.attrs = attrs or {}
        self.children = []

    def append(self, child):
        self.children.append(child)

    def __repr__(self):
        return f"<{self.tag} n={len(self.children)}>"


def is_text(node):
    return isinstance(node, tuple)


class TreeBuilder(html.parser.HTMLParser):
    """Build a Node tree from a full HTML page (tolerant of odd markup)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("html", {})
        self.stack = [self.root]
        self.skip_depth = 0

    def _top(self):
        return self.stack[-1]

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if self.skip_depth:
            if tag in STRIP_TAGS:
                self.skip_depth += 1
            return
        if tag in STRIP_TAGS:
            self.skip_depth = 1
            return
        node = Node(tag, dict(attrs))
        self._top().append(node)
        if tag not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        if self.skip_depth:
            return
        tag = tag.lower()
        if tag in STRIP_TAGS:
            return
        self._top().append(Node(tag, dict(attrs)))

    def handle_endtag(self, tag):
        tag = tag.lower()
        if self.skip_depth:
            if tag in STRIP_TAGS:
                self.skip_depth = max(0, self.skip_depth - 1)
            return
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        if self.skip_depth:
            return
        self._top().append(("text", data))


def build_tree(html_text):
    parser = TreeBuilder()
    try:
        parser.feed(html_text)
        parser.close()
    except Exception:  # pragma: no cover - parser is tolerant, keep robustness
        pass
    return parser.root


# ---------------------------------------------------------------------------
# Tree helpers
# ---------------------------------------------------------------------------

def has_class(node, *names):
    cls = node.attrs.get("class", "")
    return any(name in cls.split() for name in names)


def find_first(node, pred):
    """Depth-first pre-order search (children first, so body nodes win over
    the static page header only when the predicate matches them)."""
    stack = [node]
    while stack:
        n = stack.pop()
        if not isinstance(n, Node):
            continue
        if pred(n):
            return n
        stack.extend(reversed(n.children))
    return None


def find_all(node, pred):
    out = []
    stack = [node]
    while stack:
        n = stack.pop()
        if not isinstance(n, Node):
            continue
        if pred(n):
            out.append(n)
        stack.extend(reversed(n.children))
    return out


def collect_text(node):
    """Concatenate all descendant text, collapsing whitespace to single spaces."""
    parts = []

    def walk(n):
        if is_text(n):
            parts.append(n[1])
            return
        for c in n.children:
            walk(c)

    walk(node)
    return re.sub(r"\s+", " ", "".join(parts)).strip()


# ---------------------------------------------------------------------------
# Transform pass (before rendering)
# ---------------------------------------------------------------------------

def _find_embedded_link(figure):
    """Inside a wp-block-embed figure, grab the <blockquote><a> used by WP to
    describe the (dead) embedded page. Returns the link Node (href + label)."""
    for a in find_all(figure, lambda n: n.tag == "a" and n.attrs.get("href")):
        if a.attrs["href"].startswith(("http://", "https://")):
            return a
    return None


def _find_file_link(div):
    """Inside a wp-block-file div, grab the download <a>. Returns the link Node."""
    for a in find_all(div, lambda n: n.tag == "a" and n.attrs.get("href")):
        return a
    return None


def has_content(node):
    if is_text(node):
        return bool(node[1].strip())
    if node.tag in ("img", "hr", "br"):
        return True
    if node.tag in ("audio", "video") and node.attrs.get("src"):
        return True
    return any(has_content(c) for c in node.children)


def transform(node):
    """Rewrite one subtree into render-ready form:
    dead embeds / PDFs -> links, strip-tags dropped, empty wrappers pruned."""
    if is_text(node):
        return node
    if node.tag == "figure" and has_class(node, "wp-block-embed"):
        link = _find_embedded_link(node)
        return link if link is not None else None
    if node.tag == "div" and has_class(node, "wp-block-file"):
        link = _find_file_link(node)
        return link if link is not None else None
    if node.tag in STRIP_TAGS:
        return None

    kept = []
    for child in node.children:
        t = transform(child)
        if t is None:
            continue
        kept.append(t)
    node.children = kept
    if not has_content(node) and node.tag in (
        "p", "div", "figure", "span", "strong", "b", "em", "i", "del", "s",
        "a", "mark", "sup", "sub", "small", "code", "section", "header",
        "main", "footer", "blockquote",
    ):
        return None
    return node


def transform_all(nodes):
    """Transform a sequence of sibling nodes into a filtered, render-ready list."""
    out = []
    for n in nodes:
        t = transform(n)
        if t is not None:
            out.append(t)
    return out


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

def norm(text):
    return re.sub(r"\s+", " ", text)


def render_img(node):
    src = node.attrs.get("src", "")
    if not src:
        return None
    alt = node.attrs.get("alt", "").strip()
    return f"![{alt}]({src})"


def render_media(node, kind):
    src = node.attrs.get("src", "")
    if not src:
        return None
    if kind == "audio":
        return f'<audio controls preload="none" src="{src}"></audio>'
    return f'<video controls src="{src}"></video>'


def render_inline_seq(nodes):
    out = []
    for c in nodes:
        if is_text(c):
            out.append(norm(c[1]))
            continue
        tag = c.tag
        if tag in TRANSPARENT_INLINE:
            out.append(render_inline_seq(c.children))
        elif tag in ("strong", "b"):
            out.append("**" + render_inline_seq(c.children) + "**")
        elif tag in ("em",):
            out.append("*" + render_inline_seq(c.children) + "*")
        elif tag in ("del", "s"):
            out.append("~~" + render_inline_seq(c.children) + "~~")
        elif tag == "a":
            href = c.attrs.get("href", "")
            label = render_inline_seq(c.children)
            return_label = label if label else href
            if href:
                out.append(f"[{return_label}]({href})")
            else:
                out.append(return_label)
        elif tag == "code":
            code = re.sub(r"\s+", " ", collect_text(c))
            if "`" in code:
                out.append("`` " + code + " ``")
            else:
                out.append("`" + code + "`")
        elif tag in ("sup", "sub"):
            out.append(f"<{tag}>{render_inline_seq(c.children)}</{tag}>")
        elif tag == "br":
            out.append("  \n")
        elif tag == "img":
            img = render_img(c)
            if img:
                out.append(img)
        else:
            out.append(render_inline_seq(c.children))
    return "".join(out)


def render_inline(node):
    return render_inline_seq(node.children)


def render_plain(node):
    """Plain text of a node's subtree (for headings / metadata), no markup."""
    return re.sub(r"\s+", " ", collect_text(node)).strip()


def render_blockquote(node):
    inner = render_blocks(node.children)
    if not inner:
        return None
    lines = []
    for ln in inner.split("\n"):
        lines.append("> " + ln if ln else ">")
    return "\n".join(lines)


def _render_li_text(nodes):
    out = []
    for c in nodes:
        if is_text(c):
            out.append(norm(c[1]))
        elif isinstance(c, Node):
            if c.tag == "p":
                out.append(render_inline_seq(c.children))
            else:
                out.append(render_inline_seq([c]))
    return re.sub(r"\s+", " ", "".join(out)).strip()


def render_list(node, depth):
    indent = "  " * depth
    ordered = node.tag == "ol"
    out = []
    items = [c for c in node.children if isinstance(c, Node) and c.tag == "li"]
    for idx, li in enumerate(items):
        inline_nodes, nested = [], []
        for c in li.children:
            if is_text(c):
                inline_nodes.append(c)
            elif isinstance(c, Node) and c.tag in ("ul", "ol"):
                nested.append(c)
            else:
                inline_nodes.append(c)
        marker = f"{idx + 1}. " if ordered else "- "
        text = _render_li_text(inline_nodes)
        out.append(indent + marker + text)
        for n in nested:
            out.append(render_list(n, depth + 1))
    return "\n".join(out)


def _render_cell(cell):
    text = render_inline_seq(cell.children)
    text = text.replace("\n", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text.replace("|", "\\|")


def render_table(node):
    rows = []

    def collect(n):
        for c in n.children:
            if not isinstance(c, Node):
                continue
            if c.tag == "tr":
                rows.append(c)
            elif c.tag in ("thead", "tbody", "tfoot"):
                collect(c)

    collect(node)
    if not rows:
        return None
    grid = []
    for tr in rows:
        cells = [
            c for c in tr.children
            if isinstance(c, Node) and c.tag in ("td", "th")
        ]
        grid.append([_render_cell(c) for c in cells])
    width = max(len(r) for r in grid)
    grid = [r + [""] * (width - len(r)) for r in grid]
    # GFM tables always render the first row as header, so a delimiter row is
    # required after it — without it marked treats `| … |` lines as paragraphs.
    lines = ["| " + " | ".join(grid[0]) + " |"]
    lines.append("| " + " | ".join(["---"] * width) + " |")
    for r in grid[1:]:
        lines.append("| " + " | ".join(r) + " |")
    return "\n".join(lines)


def render_figure(node):
    # A figure wraps one media element (image / table / audio / video).
    imgs = [c for c in node.children if isinstance(c, Node) and c.tag == "img"]
    if imgs:
        rendered = [render_img(i) for i in imgs]
        return "\n".join(x for x in rendered if x) or None
    for c in node.children:
        if isinstance(c, Node):
            if c.tag == "table":
                return render_table(c)
            if c.tag == "audio":
                return render_media(c, "audio")
            if c.tag == "video":
                return render_media(c, "video")
    inner = render_blocks(node.children)
    return inner or None


def is_block(node):
    return isinstance(node, Node) and node.tag in BLOCK_TAGS


def render_block(node):
    tag = node.tag
    if tag == "p":
        return render_inline(node).strip() or None
    if tag in HEADING_LEVELS:
        text = render_plain(node)
        return ("#" * HEADING_LEVELS[tag] + " " + text) if text else None
    if tag == "hr":
        return "---"
    if tag in ("ul", "ol"):
        return render_list(node, 0)
    if tag == "blockquote":
        return render_blockquote(node)
    if tag == "table":
        return render_table(node)
    if tag == "figure":
        return render_figure(node)
    if tag == "img":
        return render_img(node)
    if tag == "audio":
        return render_media(node, "audio")
    if tag == "video":
        return render_media(node, "video")
    if tag == "pre":
        code = collect_text(node).strip()
        return "```\n" + code + "\n```" if code else None
    if tag in ("div", "header", "main", "section", "footer", "nav", "aside",
               "details", "address", "article", "dl", "dt", "dd"):
        return render_blocks(node.children) or None
    # Unknown block tag: descend transparently.
    return render_blocks(node.children) or None


def render_blocks(nodes):
    """Render a sequence of nodes into a list of markdown blocks."""
    out = []
    buf = []

    def flush():
        if buf:
            s = render_inline_seq(buf).strip()
            if s:
                out.append(s)
            buf.clear()

    for c in nodes:
        if is_block(c):
            flush()
            blk = render_block(c)
            if blk:
                out.append(blk)
        else:
            buf.append(c)
    flush()
    return "\n\n".join(out)


# ---------------------------------------------------------------------------
# Metadata extraction
# ---------------------------------------------------------------------------

def extract_metadata(tree, post_id, old_entry):
    content = find_first(
        tree, lambda n: n.tag == "div" and has_class(n, "article-content")
    )
    if content is None:
        return None

    def text_of(pred):
        n = find_first(tree, pred)
        return collect_text(n) if n is not None else ""

    title = text_of(lambda n: n.tag == "h1" and has_class(n, "post-title"))
    eyebrow = text_of(lambda n: n.tag == "div" and has_class(n, "article-eyebrow"))
    date = ""
    time_node = find_first(tree, lambda n: n.tag == "time")
    if time_node is not None and time_node.attrs.get("datetime"):
        date = time_node.attrs["datetime"]

    author = ""
    info = find_first(tree, lambda n: n.tag == "div" and has_class(n, "author-info"))
    if info is not None:
        spans = [c for c in info.children if isinstance(c, Node) and c.tag == "span"]
        for sp in spans:
            if not has_class(sp, "author-avatar"):
                author = collect_text(sp)
                break

    categories = [
        collect_text(c)
        for c in find_all(tree, lambda n: n.tag == "span" and has_class(n, "category-tag"))
    ]
    categories = [c for c in categories if c]

    featured = ""
    feat_img = find_first(
        tree, lambda n: n.tag == "img" and has_class(n, "featured-image")
    )
    if feat_img is not None:
        src = feat_img.attrs.get("src", "")
        if src.startswith("../"):
            src = src[3:]
        featured = src

    # Fall back to the previous posts.json entry when a header field is absent.
    if not title and old_entry:
        title = old_entry.get("title", "")
    if not date and old_entry:
        date = old_entry.get("date", "")
    if not categories and old_entry:
        categories = list(old_entry.get("categories", []))

    excerpt = ""
    if old_entry:
        excerpt = re.sub(r"\s+", " ", html.unescape(old_entry.get("excerpt", ""))).strip()
    if not excerpt:
        excerpt = render_plain(content)[:120]

    return {
        "id": int(post_id),
        "title": title,
        "date": date,
        "author": author,
        "eyebrow": eyebrow,
        "categories": categories,
        "featured_image": featured,
        "excerpt": excerpt,
    }


# ---------------------------------------------------------------------------
# Frontmatter / JSON / redirects
# ---------------------------------------------------------------------------

def frontmatter_str(meta):
    lines = ["---"]
    lines.append(f"id: {meta['id']}")
    for key in ("title", "date", "author", "eyebrow", "featured_image", "excerpt"):
        lines.append(f"{key}: {json.dumps(meta[key], ensure_ascii=False)}")
    lines.append(
        "categories: ["
        + ", ".join(json.dumps(c, ensure_ascii=False) for c in meta["categories"])
        + "]"
    )
    lines.append("---")
    return "\n".join(lines)


def parse_frontmatter(text):
    m = re.match(r"^---\n(.*?)\n---\n?", text, re.S)
    if not m:
        return None
    fm = {}
    for line in m.group(1).splitlines():
        line = line.rstrip()
        if not line.strip():
            continue
        if line.startswith("id:"):
            fm["id"] = int(line[3:].strip())
        elif line.startswith("categories:"):
            fm["categories"] = json.loads(line[len("categories:"):].strip())
        else:
            key, _, value = line.partition(":")
            fm[key.strip()] = json.loads(value.strip())
    return fm


def entry_from_frontmatter(fm):
    return {
        "id": fm.get("id"),
        "title": fm.get("title", ""),
        "date": fm.get("date", ""),
        "excerpt": fm.get("excerpt", ""),
        "categories": fm.get("categories", []),
        "featured_image": fm.get("featured_image", ""),
        "author": fm.get("author", ""),
        "eyebrow": fm.get("eyebrow", ""),
    }


def body_without_frontmatter(text):
    return re.sub(r"^---\n.*?\n---\n?", "", text, count=1, flags=re.S)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def md_to_plain(body):
    """Crude markdown -> plain text, good enough to diff against source text."""
    s = body
    s = re.sub(r"<[^>]+>", "", s)                      # raw HTML (audio/video/…)
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", s)          # images
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)      # links
    s = re.sub(r"`+", "", s)
    s = re.sub(r"^\s*#+\s*", "", s, flags=re.M)
    s = re.sub(r"^\s*>\s?", "", s, flags=re.M)
    s = re.sub(r"^\s*(?:[-*+]|\d+\.)\s+", "", s, flags=re.M)
    s = re.sub(r"^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$", "", s, flags=re.M)
    s = s.replace("|", " ")
    s = re.sub(r"\*\*?|~~|__", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def validate(post_id, html_text, md_text, old_entry):
    """Return a list of (kind, message) problems for one post."""
    problems = []
    tree = build_tree(html_text)
    content = find_first(
        tree, lambda n: n.tag == "div" and has_class(n, "article-content")
    )
    if content is None:
        problems.append(("structure", "no article-content node"))
        return problems

    src = re.sub(r"\s+", " ", collect_text(content)).strip()
    plain = md_to_plain(body_without_frontmatter(md_text))
    import difflib
    ratio = difflib.SequenceMatcher(None, src, plain).ratio()
    if ratio < 0.85:
        problems.append(
            ("text", f"text similarity {ratio:.3f} (src {len(src)}ch, md {len(plain)}ch)")
        )

    for m in re.finditer(r"!\[[^\]]*\]\(([^)]*)\)", md_text):
        src_path = m.group(1)
        if src_path.startswith("http"):
            continue
        if not resolve_asset(src_path).exists():
            problems.append(("image", f"missing image {m.group(1)}"))

    fm = parse_frontmatter(md_text) or {}
    feat = fm.get("featured_image", "")
    if feat and not resolve_asset(feat).exists():
        problems.append(("image", f"missing featured_image {feat}"))
    return problems


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def load_old_index():
    idx_path = POSTS_DIR / "posts.json"
    if not idx_path.exists():
        return {}
    try:
        data = json.loads(idx_path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if isinstance(data, list):
        return {e.get("id"): e for e in data if isinstance(e, dict)}
    return {}


def write_lf(path, text):
    """Write UTF-8 with LF line endings (Path.write_text would emit CRLF on
    Windows, which breaks frontmatter/`---` parsing and bloats git diffs)."""
    path.write_bytes(text.encode("utf-8"))


def run_audit(files, old_index):
    from collections import Counter
    tag_counter = Counter()
    problems = []
    meta_missing = 0
    for f in files:
        html_text = f.read_text(encoding="utf-8-sig")
        tree = build_tree(html_text)
        content = find_first(
            tree, lambda n: n.tag == "div" and has_class(n, "article-content")
        )
        if content is None:
            problems.append(f"{f.name}: no article-content")
            continue
        # inventory tags appearing in bodies
        stack = [content]
        while stack:
            n = stack.pop()
            if not isinstance(n, Node):
                continue
            if n.tag in STRIP_TAGS:
                continue
            tag_counter[n.tag] += 1
            stack.extend(n.children)
        meta = extract_metadata(tree, f.stem, old_index.get(int(f.stem)))
        if meta is None or not meta["title"] or not meta["date"]:
            meta_missing += 1
            problems.append(
                f"{f.name}: missing title/date (title={meta and meta['title']!r}, "
                f"date={meta and meta['date']!r})"
            )
    print(f"Audit: {len(files)} posts, {len(tag_counter)} distinct tags")
    for tag, count in sorted(tag_counter.items(), key=lambda kv: -kv[1]):
        print(f"  {tag}: {count}")
    if problems:
        print("\nPROBLEMS:")
        for p in problems:
            print("  -", p)
    else:
        print("\nNo problems found.")
    return problems


def run_conversion(files, old_index):
    written = 0
    for f in files:
        html_text = f.read_text(encoding="utf-8-sig")
        tree = build_tree(html_text)
        meta = extract_metadata(tree, f.stem, old_index.get(int(f.stem)))
        content = find_first(
            tree, lambda n: n.tag == "div" and has_class(n, "article-content")
        )
        if content is None or meta is None:
            print(f"SKIP {f.name}: no article-content")
            continue
        nodes = transform_all(content.children)
        body = render_blocks(nodes) if nodes else ""
        # Featured image referenced by the old page but missing on disk -> drop.
        if meta["featured_image"]:
            if not resolve_asset(meta["featured_image"]).exists():
                print(
                    f"WARN {f.name}: featured_image "
                    f"{meta['featured_image']!r} missing on disk, cleared"
                )
                meta["featured_image"] = ""
        md_path = POSTS_DIR / f"{meta['id']}.md"
        write_lf(md_path, frontmatter_str(meta) + "\n" + body + "\n")
        written += 1

    # Regenerate posts.json from MD frontmatter (single source of truth).
    entries = []
    for md_path in sorted(POSTS_DIR.glob("*.md")):
        fm = parse_frontmatter(md_path.read_text(encoding="utf-8"))
        if fm and fm.get("id") is not None:
            entries.append(entry_from_frontmatter(fm))
    entries.sort(key=lambda e: (e["date"], -e["id"] or 0), reverse=True)
    json_path = POSTS_DIR / "posts.json"
    write_lf(json_path, json.dumps(entries, ensure_ascii=False, indent=2) + "\n")
    print(f"Regenerated posts.json: {len(entries)} entries")

    # Emit explicit per-post redirect rules.
    ids = sorted(e["id"] for e in entries)
    lines = [
        "# Posts: 旧静态 <id>.html → 单页 MD 查看器（由 scripts/convert_posts.py 生成，勿手改）"
    ]
    for pid in ids:
        lines.append(
            f"/organicchurch/posts/{pid}.html  /organicchurch/posts/post.html?id={pid}  301"
        )
    write_lf(REDIRECTS_OUT, "\n".join(lines) + "\n")
    print(f"Wrote {REDIRECTS_OUT.name}: {len(ids)} redirect rules")
    print(f"Wrote {written} markdown files")
    return written


def run_validate(files, old_index):
    failures = 0
    for f in files:
        html_text = f.read_text(encoding="utf-8-sig")
        md_path = POSTS_DIR / f"{f.stem}.md"
        if not md_path.exists():
            print(f"FAIL {f.name}: missing {md_path.name}")
            failures += 1
            continue
        md_text = md_path.read_text(encoding="utf-8")
        problems = validate(f.stem, html_text, md_text, old_index.get(int(f.stem)))
        for kind, msg in problems:
            print(f"FAIL {f.name} [{kind}]: {msg}")
            failures += 1
    print(f"\nValidate: {'ALL PASS' if failures == 0 else f'{failures} problems'}")
    return failures


def main():
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    do_validate = "--validate" in args

    files = sorted(
        f for f in POSTS_DIR.glob("*.html") if f.name not in ("post.html",)
    )
    if not files:
        print(f"No HTML posts found in {POSTS_DIR}")
        return 1
    old_index = load_old_index()

    if dry_run:
        return 0 if not run_audit(files, old_index) else 1

    if do_validate:
        return 0 if run_validate(files, old_index) == 0 else 1

    run_conversion(files, old_index)
    print("\nRun `python scripts/convert_posts.py --validate` to verify output.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
