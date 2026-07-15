# tests/test_build_courseware.py
import sys
import unittest
from pathlib import Path

# Add tools directory to path
TOOLS_DIR = Path(__file__).resolve().parent.parent / 'tools'
sys.path.insert(0, str(TOOLS_DIR))

import build_courseware as bc


class TestBuildCourseware(unittest.TestCase):
    def _index_soup(self):
        index_path = bc.BOOK_DIR / 'index.html'
        return bc.BeautifulSoup(
            index_path.read_text(encoding='utf-8'), 'html.parser'
        )

    def test_parse_toc_returns_parts(self):
        parts = bc.parse_toc(self._index_soup())
        self.assertIsInstance(parts, list)
        self.assertGreater(len(parts), 0)
        for part in parts:
            self.assertIn('title', part)
            self.assertIn('chapters', part)
            self.assertIsInstance(part['chapters'], list)

    def test_parse_toc_has_eighteen_main_chapters(self):
        parts = bc.parse_toc(self._index_soup())
        # Count only parts that are not front/back matter
        main_chapters = [
            ch for part in parts
            for ch in part['chapters']
            if ch['id'].startswith('chapter')
        ]
        self.assertEqual(len(main_chapters), 18)

    def test_parse_chapter_metadata(self):
        ch = bc.parse_chapter_metadata(
            'chapter01', 'chapter01.html', '第一部 解构与危机'
        )
        self.assertEqual(ch['id'], 'chapter01')
        self.assertIn('title', ch)
        self.assertIn('kicker', ch)
        self.assertIn('href', ch)
        self.assertIn('summary', ch)
        self.assertIn('outline', ch)
        self.assertIn('scriptures', ch)
        self.assertIn('keyTerms', ch)

    def test_extract_summary_from_guide_like_html(self):
        html = '<html><body><div class="body-text"><h4>本章概要</h4><p>Summary text.</p></div></body></html>'
        soup = bc.BeautifulSoup(html, 'html.parser')
        summary = bc.extract_summary(soup)
        self.assertEqual(summary, 'Summary text.')

    def test_extract_summary_returns_empty_when_missing(self):
        html = '<html><body><div class="body-text"><p>No summary here.</p></div></body></html>'
        soup = bc.BeautifulSoup(html, 'html.parser')
        summary = bc.extract_summary(soup)
        self.assertEqual(summary, '')

    def test_extract_outline(self):
        html = '<div class="body-text"><h2>One</h2><h3>Two</h3><h4>Three</h4></div>'
        soup = bc.BeautifulSoup(html, 'html.parser')
        outline = bc.extract_outline(soup)
        self.assertEqual(len(outline), 3)
        self.assertEqual(outline[0], {'level': 2, 'text': 'One'})
        self.assertEqual(outline[1], {'level': 3, 'text': 'Two'})
        self.assertEqual(outline[2], {'level': 4, 'text': 'Three'})

    def test_extract_scriptures(self):
        html = '<div class="body-text"><p>马太福音 28:18-20 和 约翰福音 3:16</p></div>'
        soup = bc.BeautifulSoup(html, 'html.parser')
        scriptures = bc.extract_scriptures(soup)
        self.assertIn('马太福音 28:18-20', scriptures)
        self.assertIn('约翰福音 3:16', scriptures)

    def test_extract_key_terms(self):
        html = '<div class="body-text"><p><strong>Oikos</strong> and <strong>Koinonia</strong> and <strong>Oikos</strong></p></div>'
        soup = bc.BeautifulSoup(html, 'html.parser')
        terms = bc.extract_key_terms(soup, top_n=5)
        self.assertIn('Oikos', terms)
        self.assertIn('Koinonia', terms)

    def test_h3_to_chapter_key(self):
        self.assertEqual(bc.h3_to_chapter_key('第一章：身份的迷失'), 'chapter01')
        self.assertEqual(bc.h3_to_chapter_key('第十八章：功能的分化'), 'chapter18')
        self.assertEqual(bc.h3_to_chapter_key('前言'), 'preface')
        self.assertEqual(bc.h3_to_chapter_key('结语：回归'), 'conclusion')
        self.assertIsNone(bc.h3_to_chapter_key('未知章节'))

    def test_guide_questions_extraction(self):
        html = '''
        <div class="body-text">
          <h3>第一章：测试</h3>
          <h4>主题一</h4>
          <p>引导性问题</p>
          <ol><li><p>Question one?</p></li></ol>
          <p>探索性问题</p>
          <ol><li><p>Question two?</p></li></ol>
          <h4>本周实践挑战</h4>
          <p>Do something.</p>
        </div>
        '''
        soup = bc.BeautifulSoup(html, 'html.parser')
        questions = bc.extract_guide_questions(soup)
        self.assertEqual(len(questions['guided']), 1)
        self.assertEqual(len(questions['exploratory']), 1)
        self.assertEqual(len(questions['practical']), 1)

    def test_build_courseware_json_structure(self):
        data = bc.build_courseware()
        self.assertIn('title', data)
        self.assertIn('parts', data)
        self.assertEqual(len(data['parts']), 8)
        # Check every part has chapters
        for part in data['parts']:
            self.assertIn('title', part)
            self.assertIn('chapters', part)


if __name__ == '__main__':
    unittest.main()
