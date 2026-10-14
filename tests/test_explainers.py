"""Concept explainer pages: every embedded card resolves, assets exist, and the home page links each page."""
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT/'dist'
T = json.loads((DIST/'toolkit-data.js').read_text().removeprefix('window.DYLEAN_TOOLKIT=').removesuffix(';\n'))
PAGES = ['hoare.html', 'labels.html', 'state.html', 'equations.html']


class ExplainerTests(unittest.TestCase):
    def test_cards_resolve(self):
        for page in PAGES:
            html = (DIST/page).read_text()
            for name in re.findall(r'data-card="([^"]+)"', html):
                self.assertIn(name, T['names'], (page, name))
            for loc in re.findall(r'data-card-at="([^"]+)"', html):
                f, l = loc.rsplit(':', 1)
                self.assertTrue(any(d['f'] == f and d['l'] == int(l) for d in T['decls'].values()), (page, loc))
            notes = re.search(r'<script type="application/json" id="card-notes">(.*?)</script>', html, re.S)
            if notes:
                for name in json.loads(notes.group(1)):
                    self.assertIn(name, T['names'], (page, 'note', name))

    def test_assets_and_home_links(self):
        home = (DIST/'index.html').read_text()
        for page in PAGES:
            html = (DIST/page).read_text()
            for asset in ('explainer.css', 'cards.css', 'cards.js', 'explainer.js', 'toolkit-data.js'):
                self.assertIn(asset, html, (page, asset))
                self.assertTrue((DIST/asset).exists(), asset)
            self.assertIn(f'href="{page}"', home, page)

    def test_source_links_point_at_real_lines(self):
        files = json.loads((DIST/'data.js').read_text().removeprefix('window.DYLEAN_DATA=').removesuffix(';\n'))['files']
        for page in PAGES:
            html = (DIST/page).read_text()
            for f, l in re.findall(r'source\.html#file=([^"&]+)&(?:amp;)?line=(\d+)', html):
                f = f.replace('%2F', '/')
                self.assertIn(f, files, (page, f))
                if 'text' in files[f]:
                    self.assertLessEqual(int(l), len(files[f]['text'].splitlines()), (page, f, l))
