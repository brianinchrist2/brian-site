"""
Migrate all organicchurch/posts/*.html from Notion-style to Scriptorium theme.

Replaces:
  - Font <link> (Inter → Noto Serif SC + EB Garamond + Noto Sans SC)
  - Inline <style> block → <link rel="stylesheet" href="../assets/css/article.css">
  - <nav class="top-nav"> block → Scriptorium nav
  - <footer class="footer"> block → Scriptorium footer
  - Mobile menu overlay → Scriptorium mobile menu
  - .logo / .logo-mark → .brand / .brand-mark (in nav)

Preserves:
  - <title>, article content, post meta, featured image, scripts
"""

import os
import re
import sys
import glob

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

POSTS_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "brianinchrist", "organicchurch", "posts"
)

# --- New Scriptorium font link ---
NEW_FONT_LINK = (
    '<link href="https://fonts.googleapis.com/css2?'
    'family=Noto+Serif+SC:wght@400;500;600;700'
    '&family=Noto+Sans+SC:wght@400;500;700'
    '&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500'
    '&display=swap" rel="stylesheet">'
)

# --- New CSS link (replaces inline <style>) ---
NEW_CSS_LINK = '<link rel="stylesheet" href="../assets/css/article.css">'

# --- New Scriptorium nav HTML ---
NEW_NAV = """<nav class="top-nav" aria-label="Main Navigation">
    <div class="nav-inner">
      <a href="../../index.html" class="brand">
        <span class="brand-mark">✝</span>
        <span>有机教会 <small>Organic Church</small></span>
      </a>

      <div style="display:flex; gap:18px; align-items:center;">
        <div class="nav-links">
          <a href="../../index.html#testimony" class="nav-link"><span class="lang-en">About</span><span class="lang-zh">关于</span></a>
          <a href="../index.html" class="nav-link"><span class="lang-en">Journal</span><span class="lang-zh">文章</span></a>
          <a href="../../index.html#book" class="nav-link"><span class="lang-en">Book</span><span class="lang-zh">著作</span></a>
          <a href="../../oikos_church/courseware/index.html" class="nav-link"><span class="lang-en">Courseware</span><span class="lang-zh">课件</span></a>
        </div>

        <div class="lang-toggle" aria-label="Language Toggle">
          <button id="lang-en-btn" class="active" onclick="switchLang('en')">EN</button>
          <button id="lang-zh-btn" onclick="switchLang('zh')">中</button>
        </div>

        <button id="mobile-menu-btn" class="mobile-menu-btn" onclick="toggleMobileMenu(true)" aria-label="Toggle Navigation Menu">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
  </nav>"""

# --- New Scriptorium footer HTML ---
NEW_FOOTER = """<footer class="footer">
    <div class="container">
      <p>&copy; 2026 有机教会 · <span class="soli">Soli Deo Gloria</span></p>
    </div>
  </footer>"""

# --- New Scriptorium mobile menu overlay ---
NEW_MOBILE_MENU = """<!-- Mobile Menu Overlay -->
  <div id="mobile-menu-overlay" class="mobile-menu-overlay" onclick="toggleMobileMenu(false)">
    <div class="mobile-menu-card" onclick="event.stopPropagation()">
      <button class="mobile-menu-close" onclick="toggleMobileMenu(false)">&times;</button>
      <div class="mobile-menu-links">
        <a href="../../index.html#testimony" onclick="toggleMobileMenu(false)"><span class="lang-en">About</span><span class="lang-zh">关于</span></a>
        <a href="../index.html" onclick="toggleMobileMenu(false)"><span class="lang-en">Journal</span><span class="lang-zh">文章</span></a>
        <a href="../../index.html#book" onclick="toggleMobileMenu(false)"><span class="lang-en">Book</span><span class="lang-zh">著作</span></a>
        <a href="../../oikos_church/courseware/index.html" onclick="toggleMobileMenu(false)"><span class="lang-en">Courseware</span><span class="lang-zh">课件</span></a>
      </div>
    </div>
  </div>"""

# --- New back-to-blog button (restyled) ---
# We replace the old back button class names to match new CSS
def migrate_file(filepath: str) -> bool:
    """Migrate a single post HTML file. Returns True if changed."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # 1. Replace font link (Inter → Scriptorium fonts)
    content = re.sub(
        r'<link href="https://fonts\.googleapis\.com/css2\?family=Inter[^"]*"[^>]*>',
        NEW_FONT_LINK,
        content
    )

    # 2. Replace entire inline <style> block with CSS link
    content = re.sub(
        r'<style>.*?</style>',
        NEW_CSS_LINK,
        content,
        flags=re.DOTALL
    )

    # 3. Replace nav block (from <nav class="top-nav" to matching </nav>)
    content = re.sub(
        r'<nav class="top-nav"[^>]*>.*?</nav>',
        NEW_NAV,
        content,
        flags=re.DOTALL
    )

    # 4. Replace footer block
    content = re.sub(
        r'<footer class="footer"[^>]*>.*?</footer>',
        NEW_FOOTER,
        content,
        flags=re.DOTALL
    )

    # 5. Replace mobile menu overlay
    content = re.sub(
        r'<!-- Mobile Menu Overlay -->.*?(?=</body>)',
        NEW_MOBILE_MENU + "\n  ",
        content,
        flags=re.DOTALL
    )

    # 6. Replace back-to-blog button class (btn-secondary → btn-ghost)
    content = content.replace('class="btn btn-secondary"', 'class="btn btn-ghost"')

    # 7. Update back-to-blog link text for Scriptorium style
    # (Keep existing text, just update the arrow)

    # 8. Add article-eyebrow before post-title if not present
    # The eyebrow shows the category in Latin small-caps style
    # We extract categories from the existing category-tags
    if 'article-eyebrow' not in content:
        # Try to extract the first category tag text
        cat_match = re.search(r'<span class="category-tag">([^<]+)</span>', content)
        if cat_match:
            cat_text = cat_match.group(1)
            eyebrow = f'<div class="article-eyebrow">{cat_text}</div>'
            content = re.sub(
                r'(<header class="article-header">)\s*(<h1)',
                rf'\1\n        {eyebrow}\n        \2',
                content,
                count=1
            )

    # 9. Add meta-sep spans between meta items if not present
    # Replace the bare "•" dividers with styled meta-sep spans
    content = re.sub(
        r'<div>\s*</div>(?=\s*<time)',
        '<span class="meta-sep">·</span>',
        content
    )
    content = re.sub(
        r'<div>\s*</div>(?=\s*<div class="category-tags")',
        '<span class="meta-sep">·</span>',
        content
    )

    # 10. Ensure progress-bar div exists (some files may have it as first child)
    if 'progress-bar' not in content:
        content = content.replace(
            '<body>',
            '<body>\n  <div class="progress-bar" id="progressBar"></div>',
            1
        )

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False


def main() -> None:
    files = sorted(glob.glob(os.path.join(POSTS_DIR, "*.html")))
    print(f"Found {len(files)} post files in {POSTS_DIR}")

    changed = 0
    skipped = 0
    errors = 0

    for i, filepath in enumerate(files):
        try:
            if migrate_file(filepath):
                changed += 1
                if (changed <= 3) or (changed % 50 == 0):
                    print(f"  [{i+1}/{len(files)}] Migrated: {os.path.basename(filepath)}")
            else:
                skipped += 1
        except Exception as e:
            errors += 1
            print(f"  ERROR {os.path.basename(filepath)}: {e}")

    print(f"\nDone. Changed: {changed}, Skipped: {skipped}, Errors: {errors}")


if __name__ == "__main__":
    main()
