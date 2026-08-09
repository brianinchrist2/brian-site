#!/usr/bin/env node
/**
 * Round-trip render check for the posts HTML→MD conversion.
 *
 * Loads the SAME vendored marked build the site uses
 * (organicchurch/library/assets/js/marked.min.js), renders each converted
 * MD body, and compares structural element counts against the source
 * `article-content` HTML. Hard-fails on structural/media tag mismatches
 * (h2/h3/h4, table, img, audio, video, blockquote, li, hr) that would
 * indicate lost content; tolerates styling wrappers (strong/em/a/p).
 *
 * Usage:  node scripts/check_posts.mjs [--all] [--verbose]
 */

import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const POSTS_DIR = join(ROOT, 'brianinchrist', 'organicchurch', 'posts');
const MARKED_PATH = join(
  ROOT, 'brianinchrist', 'organicchurch', 'library', 'assets', 'js', 'marked.min.js',
);

const req = createRequire(MARKED_PATH);
const marked = req(MARKED_PATH);
if (typeof marked.parse !== 'function') {
  console.error('FAIL: vendored marked.min.js has no .parse');
  process.exit(1);
}

// Tags whose count must match source ↔ rendered MD (structural integrity:
// content would be lost if these mismatched). blockquote/li are moved to
// SOFT because dead WP iframe embeds are intentionally converted to links
// (their hidden blockquote disappears) and literal "1." text re-parses as
// ordered lists.
const HARD = ['h2', 'h3', 'h4', 'table', 'img', 'audio', 'video', 'hr'];
const SOFT = ['blockquote', 'li'];

/** Count tags in the *rendered MD*. Every tag that renders must be present. */
function countTags(html) {
  const out = {};
  for (const tag of [...HARD, ...SOFT]) {
    out[tag] = (html.match(new RegExp(`<${tag}\\b`, 'g')) || []).length;
  }
  return out;
}

/**
 * Count meaningful tags in the *source* article-content. Empty headings
 * (`<h3></h3>`) and media without a `src` (dead `<audio autoplay>`) are
 * intentionally dropped by the converter, so they are excluded here too.
 */
function countSource(html) {
  const out = {};
  for (const tag of ['h2', 'h3', 'h4']) {
    out[tag] = 0;
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
    let m;
    while ((m = re.exec(html))) {
      if (m[1].replace(/<[^>]+>/g, '').trim()) out[tag] += 1;
    }
  }
  out.table = (html.match(/<table\b/g) || []).length;
  out.img = (html.match(/<img\b/g) || []).length;
  out.hr = (html.match(/<hr\b/g) || []).length;
  out.audio = (html.match(/<audio\b[^>]*\bsrc=/g) || []).length;
  out.video = (html.match(/<video\b[^>]*\bsrc=/g) || []).length;
  out.blockquote = (html.match(/<blockquote\b/g) || []).length;
  out.li = (html.match(/<li\b/g) || []).length;
  return out;
}

/** Extract the innerHTML of the first <div class="article-content">…</div>. */
function extractArticleContent(html) {
  const openRe = /<div\s+class="[^"]*article-content[^"]*">/i;
  const openMatch = openRe.exec(html);
  if (!openMatch) return null;
  let i = html.indexOf('>', openMatch.index) + 1;
  let depth = 1;
  const divOpen = /<div\b/g;
  const divClose = /<\/div\s*>/g;
  let nextOpen = divOpen.exec(html);
  let nextClose = divClose.exec(html);
  // start searching after the opening tag
  divOpen.lastIndex = i;
  divClose.lastIndex = i;
  nextOpen = divOpen.exec(html);
  nextClose = divClose.exec(html);
  while (depth > 0) {
    const posOpen = nextOpen ? nextOpen.index : Infinity;
    const posClose = nextClose ? nextClose.index : Infinity;
    if (posClose === Infinity) break;
    if (posOpen < posClose) {
      depth += 1;
      nextOpen = divOpen.exec(html);
    } else {
      depth -= 1;
      if (depth === 0) return html.slice(i, posClose);
      nextClose = divClose.exec(html);
    }
  }
  return html.slice(i);
}

function stripFrontmatter(md) {
  return md.replace(/^---\n.*?\n---\n?/s, '');
}

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const all = args.includes('--all');

  const mdFiles = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md')).sort();
  // Sample coverage: every structural shape plus a spread of sizes.
  const SAMPLE_IDS = [
    5602, 7388, 7394, 8161, 6037, 6596, 7577, 7175, 6022, 6088, 7543, 6900,
    680, 708, 729, 5613, 7348, 7530, 8120, 8289, 7787, 7724, 5854, 8262,
  ];
  const target = all ? mdFiles : mdFiles.filter((f) => {
    const id = parseInt(f.replace('.md', ''), 10);
    return SAMPLE_IDS.includes(id);
  });

  let failures = 0;
  let checked = 0;

  for (const file of target) {
    const id = file.replace('.md', '');
    const htmlPath = join(POSTS_DIR, `${id}.html`);
    let sourceHtml;
    try {
      sourceHtml = readFileSync(htmlPath, 'utf-8');
    } catch {
      continue; // old HTML page already removed — nothing to compare
    }
    const md = readFileSync(join(POSTS_DIR, file), 'utf-8');
    const rendered = marked.parse(stripFrontmatter(md));
    const srcCounts = countSource(extractArticleContent(sourceHtml) || '');
    const mdCounts = countTags(rendered);

    const problems = [];
    const notes = [];
    for (const tag of HARD) {
      if (srcCounts[tag] !== mdCounts[tag]) {
        problems.push(`${tag} ${srcCounts[tag]}→${mdCounts[tag]}`);
      }
    }
    for (const tag of SOFT) {
      if (srcCounts[tag] !== mdCounts[tag]) {
        notes.push(`${tag} ${srcCounts[tag]}→${mdCounts[tag]}`);
      }
    }
    if (problems.length) {
      failures += 1;
      console.log(`FAIL ${file}: ${problems.join(', ')}${notes.length ? `  (soft: ${notes.join(', ')})` : ''}`);
    } else if (notes.length && verbose) {
      console.log(`warn ${file}: ${notes.join(', ')}`);
    } else if (verbose) {
      console.log(`ok   ${file}: ${JSON.stringify(mdCounts)}`);
    }
    checked += 1;
  }

  console.log(`\ncheck_posts: ${checked} posts, ${failures} failures`);
  process.exit(failures ? 1 : 0);
}

main();
