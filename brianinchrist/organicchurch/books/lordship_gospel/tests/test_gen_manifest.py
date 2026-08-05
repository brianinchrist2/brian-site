"""Tests for gen_manifest.py — manifest builder for the MD book reader.

Runs against the real courseware.json + manuscript/*.md of lordship_gospel.
"""

import json
import sys
import unittest
from pathlib import Path

BOOK_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BOOK_DIR / "tools"))

import gen_manifest  # noqa: E402


class TestGenManifest(unittest.TestCase):
    """Integration tests against the real book data."""

    @classmethod
    def setUpClass(cls):
        cls.manifest = gen_manifest.build_manifest(BOOK_DIR)

    def test_parts_and_chapter_counts(self):
        self.assertEqual(len(self.manifest["parts"]), 6)
        total = sum(len(p["chapters"]) for p in self.manifest["parts"])
        self.assertEqual(total, 18)

    def test_chapter_fields_and_files_exist(self):
        for part in self.manifest["parts"]:
            for ch in part["chapters"]:
                for field in ("id", "title", "file", "cw"):
                    self.assertNotEqual(ch.get(field), "", f"{field} empty for {ch.get('id')}")
                self.assertTrue(
                    (BOOK_DIR / ch["file"]).exists(), f"missing file {ch['file']}"
                )

    def test_id_order_and_part_keys(self):
        ids = [ch["id"] for p in self.manifest["parts"] for ch in p["chapters"]]
        self.assertEqual(ids, [f"{i:02d}" for i in range(18)])

        cw = json.loads(
            (BOOK_DIR / "courseware/assets/data/courseware.json").read_text(encoding="utf-8")
        )
        cw_parts = [p["title"] for p in cw["parts"] if p["title"] != "学习资源"]
        manifest_parts = [p["part"] for p in self.manifest["parts"]]
        self.assertEqual(manifest_parts, cw_parts)

    def test_title_from_md_first_line(self):
        by_id = {ch["id"]: ch for p in self.manifest["parts"] for ch in p["chapters"]}
        self.assertEqual(by_id["00"]["title"], "绪论：速成福音的危机与反思")
        self.assertEqual(by_id["01"]["title"], "第一章：福音的视角——从人的需要到神的计划")
        self.assertEqual(
            by_id["16"]["title"],
            "结语：重价的福音，真正的门徒——上帝的主权与我们的责任",
        )
        self.assertEqual(by_id["17"]["title"], "附录：效忠与历史神学的对话")

    def test_cw_matches_courseware_ids(self):
        cw = json.loads(
            (BOOK_DIR / "courseware/assets/data/courseware.json").read_text(encoding="utf-8")
        )
        cw_ids = [c["id"] for p in cw["parts"] if p["title"] != "学习资源" for c in p["chapters"]]
        manifest_cws = [ch["cw"] for p in self.manifest["parts"] for ch in p["chapters"]]
        self.assertEqual(manifest_cws, cw_ids)

    def test_top_level_metadata(self):
        self.assertEqual(self.manifest["id"], "lordship_gospel")
        self.assertEqual(self.manifest["title"], "主权福音与传福音")
        self.assertEqual(self.manifest["subtitle"], "The Lordship Gospel")
        self.assertEqual(self.manifest["lang"], "zh-CN")
        self.assertEqual(self.manifest["courseware"], "courseware/chapter.html")
        self.assertIn("全书 18 章", self.manifest["stat"])
        self.assertIn("六部", self.manifest["stat"])

    def test_json_output_ascii_safe(self):
        raw = json.dumps(self.manifest, ensure_ascii=False, indent=2)
        self.assertNotIn("\\u", raw)
        json.loads(raw)  # must re-parse


if __name__ == "__main__":
    unittest.main()
