"""The #combine explainer: every embedded card resolves and the invocation panels match the export."""
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT/'dist'
HTML = (DIST/'combine.html').read_text()
T = json.loads((DIST/'toolkit-data.js').read_text().removeprefix('window.DYLEAN_TOOLKIT=').removesuffix(';\n'))
DECLS = T['decls']


class CombineTests(unittest.TestCase):
    def test_named_cards_resolve(self):
        for name in re.findall(r'data-card="([^"]+)"', HTML):
            self.assertIn(name, T['names'], name)

    def test_located_cards_and_rules_resolve(self):
        for loc, is_rule in re.findall(r'data-(?:card-at|open-rule)="([^"]+)"(\s+data-rule)?', HTML):
            file, line = loc.rsplit(':', 1)
            hits = [d for d in DECLS.values() if d['f'] == file and d['l'] == int(line)]
            self.assertTrue(hits, loc)
        for loc in re.findall(r'data-open-rule="([^"]+)"', HTML):
            file, line = loc.rsplit(':', 1)
            rules = [d for d in DECLS.values() if d['f'] == file and d['l'] == int(line) and 'macroRules' in d['n']]
            self.assertEqual(len(rules), 1, loc)

    def test_every_combine_rule_in_the_source_is_in_the_table(self):
        rules = sorted((d['f'], d['l']) for d in DECLS.values() if 'macroRules' in d['n'] and '#combine_one' in d['n'])
        listed = sorted((f, int(l)) for f, l in (x.rsplit(':', 1) for x in re.findall(r'data-open-rule="([^"]+)"', HTML)))
        self.assertEqual(rules, listed)

    def test_invocation_counts_match_the_prose(self):
        counts = {}
        for loc in re.findall(r'data-invocation="([^"]+)"', HTML):
            file, line = loc.rsplit(':', 1)
            counts[loc] = sum(1 for d in DECLS.values() if d['k'] == 'generated declaration' and d['f'] == file and d['l'] == int(line))
        self.assertEqual(len(counts), 8)
        self.assertEqual(counts['Examples/SignedDH/Instance.lean:35'], 14)
        self.assertEqual(sum(counts.values()), 113)
        self.assertIn('113 declarations', HTML)
        self.assertIn('14 declarations', HTML)

    def test_assets_and_links(self):
        for asset in ('combine.css', 'cards.css', 'cards.js', 'combine.js', 'toolkit-data.js'):
            self.assertIn(asset, HTML)
            self.assertTrue((DIST/asset).exists(), asset)
        self.assertIn('combine.html', (DIST/'index.html').read_text())
