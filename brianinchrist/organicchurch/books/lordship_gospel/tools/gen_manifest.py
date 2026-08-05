"""Generate manifest.json for the MD book reader (lordship_gospel).

Data sources:
- courseware.json: part structure + per-chapter courseware id/title (authority for
  part titles and chapter order; the "学习资源" part is excluded).
- manuscript/{id}_*.md: chapter title from the MD first line ("# " prefix stripped);
  falls back to the courseware title if the first line is not an H1.
  The manuscript/ directory is the canonical book data source (all book MD files).

Output contract (spec: docs/superpowers/specs/2026-08-05-md-book-reader-design.md):
- parts use the "part" key; chapters carry id/title/file plus the plan's "cw"
  extension for courseware buttons.
"""

import json
from pathlib import Path

# id (book order) -> cw (courseware chapter id)
CHAPTERS: list[tuple[str, str]] = [
    ("00", "introduction"),
    ("01", "chapter01"),
    ("02", "chapter02"),
    ("03", "chapter03"),
    ("04", "chapter04"),
    ("05", "chapter05"),
    ("06", "chapter06"),
    ("07", "chapter07"),
    ("08", "bridging"),
    ("09", "chapter08"),
    ("10", "chapter09"),
    ("11", "chapter10"),
    ("12", "chapter11"),
    ("13", "chapter12"),
    ("14", "chapter13"),
    ("15", "chapter14"),
    ("16", "conclusion"),
    ("17", "appendix"),
]

EXCLUDED_PART = "学习资源"

META = {
    "id": "lordship_gospel",
    "title": "主权福音与传福音",
    "subtitle": "The Lordship Gospel",
    "desc": "从圣经神学重新认识福音——福音不是关于你需要的叙事，而是关于神掌权的宣告。",
    "lang": "zh-CN",
    "stat": "全书 18 章 · 六部 · 约 8 万字",
    "courseware": "courseware/chapter.html",
}


def _title_from_md(md_file: Path) -> str | None:
    """Return the first '# ' H1 of the MD file (prefix stripped), else None."""
    first = md_file.read_text(encoding="utf-8").splitlines()[0].strip()
    if first.startswith("# "):
        return first[2:].strip()
    return None


def build_manifest(book_dir: Path) -> dict:
    """Build the manifest dict for the book rooted at book_dir."""
    cw_path = book_dir / "courseware/assets/data/courseware.json"
    if not cw_path.exists():
        raise FileNotFoundError(f"courseware.json not found: {cw_path}")

    courseware = json.loads(cw_path.read_text(encoding="utf-8"))
    cw_by_id = {c["id"]: c for p in courseware["parts"] for c in p["chapters"]}

    # numeric id -> cw, from the built-in CHAPTERS mapping
    cw_for = {cid: cwid for cid, cwid in CHAPTERS}
    if len(cw_for) != len(CHAPTERS):
        raise ValueError("CHAPTERS mapping contains duplicate ids")

    parts: list[dict] = []
    for part in courseware["parts"]:
        if part["title"] == EXCLUDED_PART:
            continue
        chapters: list[dict] = []
        for ch in part["chapters"]:
            cwid = ch["id"]
            cid = next((nid for nid, w in CHAPTERS if w == cwid), None)
            if cid is None:
                raise ValueError(f"cw {cwid} not present in CHAPTERS mapping")

            matches = list(book_dir.glob(f"manuscript/{cid}_*.md"))
            if len(matches) != 1:
                raise FileNotFoundError(
                    f"expected exactly one MD for id {cid}, found {len(matches)}: {matches}"
                )
            md_file = matches[0]

            title = _title_from_md(md_file) or ch["title"]
            chapters.append(
                {
                    "id": cid,
                    "title": title,
                    "file": f"manuscript/{md_file.name}",
                    "cw": cwid,
                }
            )
        parts.append({"part": part["title"], "chapters": chapters})

    return {**META, "parts": parts}


def main() -> None:
    book_dir = Path(__file__).resolve().parents[1]
    data = build_manifest(book_dir)
    out = book_dir / "manifest.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {out} ({len(data['parts'])} parts, "
          f"{sum(len(p['chapters']) for p in data['parts'])} chapters)")


if __name__ == "__main__":
    main()
