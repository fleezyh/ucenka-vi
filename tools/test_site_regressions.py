"""Run with: py -3 -m unittest discover -s tools -p test_site_regressions.py"""
import json
import unittest
from datetime import date
from pathlib import Path
from fetch_analytics import totals_from

ROOT = Path(__file__).resolve().parent.parent
PAGES = ["index.html"] + [f"{name}/index.html" for name in
    ("picker", "dashboard", "heatmap", "perf", "sales", "stock", "funnel")]
BEACON = "907d91d4e2e044f682da0d451e684f83"

class SiteRegressions(unittest.TestCase):
    def test_every_page_has_one_correct_beacon(self):
        site_tag = json.loads((ROOT / "tools/analytics_config.json").read_text(encoding="utf-8"))["siteTag"]
        for page in PAGES:
            with self.subTest(page=page):
                html = (ROOT / page).read_text(encoding="utf-8")
                self.assertEqual(html.count("static.cloudflareinsights.com/beacon.min.js"), 1)
                self.assertIn(BEACON, html)
                self.assertNotIn(site_tag, html)
                self.assertIn('name="viewport"', html)

    def test_sparse_days_do_not_become_today(self):
        days = [{"дата": "2026-09-02", "просмотры": 70, "посетители": 30}]
        self.assertEqual(totals_from(days, 1, date(2026, 9, 5))["просмотры"], 0)
        self.assertEqual(totals_from(days, 7, date(2026, 9, 5))["просмотры"], 70)
        self.assertEqual(totals_from(days, 7, date(2026, 9, 10))["просмотры"], 0)

    def test_calendar_boundaries_and_future(self):
        days = [{"дата": d, "просмотры": 1, "посетители": 1} for d in
                ("2026-08-29", "2026-08-30", "2026-09-05", "2026-09-06")]
        self.assertEqual(totals_from(days, 7, date(2026, 9, 5))["просмотры"], 2)

    def test_home_is_a_switchboard_and_picker_has_its_own_route(self):
        home = (ROOT / "index.html").read_text(encoding="utf-8")
        picker = (ROOT / "picker/index.html").read_text(encoding="utf-8")
        self.assertIn('role="tablist"', home)
        self.assertIn('data-panel="analytics"', home)
        self.assertIn('data-panel="tools"', home)
        self.assertIn('href="picker/"', home)
        self.assertIn('<base href="../">', picker)
        self.assertIn('nav.js?v=', picker)

if __name__ == "__main__":
    unittest.main()
