#!/usr/bin/env python3
"""Batch refactor book2 HTML files: extract inline CSS/JS to external files.

For each chapter HTML file:
  - Remove the large inline <style> block (reader CSS)
  - Remove the large inline reader <script> IIFE
  - Preserve the tiny theme-restore <script> in <head>
  - Add <link> tags for reader.css + courseware-panel.css in <head>
  - Add <script src> tags for reader.js + courseware-panel.js before </body>
  - For en/chapter01.html and en/chapter02.html: add topbar courseware button

Usage:
    python refactor_books.py <book2_dir>
    # e.g. python refactor_books.py ../book2
    # e.g. python refactor_books.py ../en/book2
    # e.g. python refactor_books.py ../zh/book2
"""

import re
import sys
import pathlib
from bs4 import BeautifulSoup, Tag, NavigableString
from typing import List, Optional

# ── Constants ──────────────────────────────────────────────────────────────

ASSETS_DIR_NAME = "assets"

# The path prefix from a chapter file to the shared assets directory.
# Computed dynamically per file.

SKIP_FILES = {"index.html"}


# ── Helpers ────────────────────────────────────────────────────────────────


def compute_assets_relative(html_path: pathlib.Path) -> str:
    """Compute relative path from an HTML file to ``assets/``.

    ``assets/`` lives at ``books/assets/``.  The HTML file is one of::

        books/book2/*.html       -> depth 1, prefix = ``../assets/``
        books/en/book2/*.html    -> depth 2, prefix = ``../../assets/``
        books/zh/book2/*.html    -> depth 2, prefix = ``../../assets/``
    """
    parts = html_path.resolve().parent.relative_to(
        html_path.resolve().parent.anchor
    ).parts
    # Walk up until we find the books/ directory or hit root
    # Simpler approach: just check if path contains en/ or zh/
    path_str = str(html_path.as_posix())
    if "/en/" in path_str or "/zh/" in path_str:
        return "../../assets"
    return "../assets"


def find_reader_style(soup: BeautifulSoup) -> Optional[Tag]:
    """Find the large inline <style> block (the reader CSS).

    It's the first <style> in <head>.  We identify it by size (>500 chars).
    """
    styles = soup.find_all("style")
    for s in styles:
        if s.string and len(s.string) > 500:
            return s
    return None


def find_theme_restore_script(soup: BeautifulSoup) -> Optional[Tag]:
    """Find the tiny theme-restore script (lines 8-14 in source).

    It's a <script> in <head> that reads localStorage and sets data-theme.
    Identified by containing 'reader_theme' and being small (<500 chars).
    """
    for script in soup.find_all("script"):
        if script.string and "reader_theme" in script.string and len(script.string) < 500:
            return script
    return None


def find_reader_script(soup: BeautifulSoup) -> Optional[Tag]:
    """Find the large reader IIFE <script> (the one to remove).

    It's a <script> before </body> containing 'readerSetTheme' and 'buildOutline'.
    """
    for script in soup.find_all("script"):
        if script.string and "readerSetTheme" in script.string and len(script.string) > 300:
            return script
    return None


def has_courseware_button_in_topbar(soup: BeautifulSoup) -> bool:
    """Check if the page already has a .courseware-btn in the topbar."""
    topbar = soup.find("header", class_="topbar")
    if not topbar:
        return False
    return bool(topbar.find(class_="courseware-btn"))


def has_external_reader_css(soup: BeautifulSoup) -> bool:
    """Check if the page already links to reader.css externally."""
    for link in soup.find_all("link", rel="stylesheet"):
        href = link.get("href", "")
        if "reader.css" in href:
            return True
    return False


def has_external_reader_js(soup: BeautifulSoup) -> bool:
    """Check if the page already links to reader.js."""
    for script in soup.find_all("script", src=True):
        src = script.get("src", "")
        if "reader.js" in src:
            return True
    return False


# ── Transformations ────────────────────────────────────────────────────────


def add_courseware_button_to_topbar(soup: BeautifulSoup, assets_prefix: str) -> bool:
    """Add a courseware button to the topbar for English chapters that lack it.

    Returns True if button was added.
    """
    topbar = soup.find("header", class_="topbar")
    if not topbar:
        return False

    # For en files, the topbar has: menu-btn, title, settings-btn
    # Add courseware button after the settings button
    settings_btn = topbar.find(class_="settings-btn")
    if not settings_btn:
        return False

    # Determine courseware href based on file name
    # Extract chapter ID from page
    chapter_id = "chapter01"  # default
    for script in soup.find_all("script"):
        if script.string and "courseware" in str(script.string):
            # Try to extract from existing footer link
            pass

    # Try to find existing courseware path from footer
    footer_link = soup.find("a", class_="courseware-footer-btn")
    if footer_link:
        href = footer_link.get("href", "")
        if "?c=" in href:
            chapter_id = href.split("?c=")[-1].split("&")[0]

    # Create new button element
    btn = soup.new_tag(
        "a",
        href=f"../courseware/chapter.html?c={chapter_id}",
        **{"class": "nav-btn courseware-btn"},
        style="background-color: var(--accent2); color: #fff; border-color: var(--accent2);"
    )
    btn.string = "Courseware"

    # Insert after settings button
    settings_btn.insert_after(btn)
    # Add a space after the button
    btn.insert_after(soup.new_string(" "))

    return True


def refactor_file(html_path: pathlib.Path, dry_run: bool = False) -> List[str]:
    """Refactor a single HTML file.

    Returns a list of change descriptions (empty if no changes).
    """
    changes: List[str] = []
    assets_prefix = compute_assets_relative(html_path)

    with open(html_path, "r", encoding="utf-8") as f:
        original = f.read()

    soup = BeautifulSoup(original, "html.parser")

    # ── Skip if already refactored ──
    if has_external_reader_css(soup) and has_external_reader_js(soup):
        return ["already refactored"]

    # ── 1. Remove inline reader <style> ──
    style_tag = find_reader_style(soup)
    if style_tag:
        changes.append("remove inline <style> block")
        style_tag.decompose()

    # ── 2. Add <link> for reader.css in <head> ──
    head = soup.find("head")
    if head and not has_external_reader_css(soup):
        # Find the Google Fonts link to insert after
        fonts_link = head.find("link", href=lambda h: h and "fonts.googleapis.com" in h)
        
        link_reader = soup.new_tag(
            "link",
            rel="stylesheet",
            href=f"{assets_prefix}/css/reader.css",
        )
        link_panel = soup.new_tag(
            "link",
            rel="stylesheet",
            href=f"{assets_prefix}/css/courseware-panel.css",
        )

        if fonts_link:
            fonts_link.insert_after(link_reader)
            link_reader.insert_after(soup.new_string("\n"))
            link_reader.insert_after(link_panel)
        else:
            head.append(soup.new_string("\n"))
            head.append(link_reader)
            head.append(soup.new_string("\n"))
            head.append(link_panel)
        
        changes.append("add <link> to reader.css + courseware-panel.css")

    # ── 3. Remove inline reader <script> (the IIFE) ──
    reader_script = find_reader_script(soup)
    if reader_script:
        changes.append("remove inline reader <script>")
        reader_script.decompose()

    # ── 4. Add <script src> tags before </body> ──
    body = soup.find("body")
    if body and not has_external_reader_js(soup):
        script_reader = soup.new_tag(
            "script",
            src=f"{assets_prefix}/js/reader.js",
        )
        script_panel = soup.new_tag(
            "script",
            src=f"{assets_prefix}/js/courseware-panel.js",
        )
        
        body.append(soup.new_string("\n"))
        body.append(script_reader)
        body.append(soup.new_string("\n"))
        body.append(script_panel)
        body.append(soup.new_string("\n"))
        
        changes.append("add <script> to reader.js + courseware-panel.js")

    # ── 5. For en/chapter01.html and en/chapter02.html: add topbar button ──
    filename = html_path.name
    is_en = "/en/" in str(html_path.as_posix())
    if is_en and filename in ("chapter01.html", "chapter02.html"):
        if not has_courseware_button_in_topbar(soup):
            if add_courseware_button_to_topbar(soup, assets_prefix):
                changes.append("add topbar courseware button")

    # ── Write back ──
    if changes and not dry_run:
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(str(soup))

    return changes


def refactor_directory(dir_path: pathlib.Path, dry_run: bool = False) -> None:
    """Refactor all HTML files in a directory."""
    if not dir_path.is_dir():
        print(f"Error: {dir_path} is not a directory")
        return

    html_files = sorted(dir_path.glob("*.html"))
    total = 0
    changed = 0
    skipped = 0
    errors = 0

    print(f"\n{'='*60}")
    print(f"Processing: {dir_path}")
    print(f"{'='*60}")

    for html_file in html_files:
        if html_file.name in SKIP_FILES:
            print(f"  SKIP  {html_file.name} (excluded)")
            skipped += 1
            continue

        total += 1
        try:
            result = refactor_file(html_file, dry_run=dry_run)
            if not result:
                print(f"  OK    {html_file.name} (no changes needed)")
            elif result == ["already refactored"]:
                print(f"  DONE  {html_file.name} (already refactored)")
                changed += 1
            else:
                status = "DRY-RUN" if dry_run else "REFACTORED"
                print(f"  {status} {html_file.name}: {', '.join(result)}")
                changed += 1
        except Exception as e:
            print(f"  ERROR {html_file.name}: {e}")
            errors += 1

    print(f"\nSummary: {total} files, {changed} changed, {skipped} skipped, {errors} errors")


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python refactor_books.py <book2_dir> [--dry-run]")
        print("  e.g. python refactor_books.py ../book2")
        print("  e.g. python refactor_books.py ../en/book2")
        print("  e.g. python refactor_books.py ../zh/book2")
        sys.exit(1)

    dir_path = pathlib.Path(sys.argv[1]).resolve()
    dry_run = "--dry-run" in sys.argv

    refactor_directory(dir_path, dry_run=dry_run)


if __name__ == "__main__":
    main()
