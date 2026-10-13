"""The proof toolkit: generated declaration data is closed and the curated manifest resolves."""
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT/'dist'
T = json.loads((DIST/'toolkit-data.js').read_text().removeprefix('window.DYLEAN_TOOLKIT=').removesuffix(';\n'))
MANIFEST = json.loads((ROOT/'web/toolkit/manifest.json').read_text())
HTML = (DIST/'toolkit.html').read_text()


class ToolkitTests(unittest.TestCase):
    def test_every_manifest_item_resolved_and_curated_once(self):
        wanted = sum(len(c['items']) for c in MANIFEST['categories'])
        got = sum(len(c['items']) for c in T['categories'])
        self.assertEqual(wanted, got)
        for cat in T['categories']:
            for item in cat['items']:
                self.assertIn(item['id'], T['decls'], item.get('label'))
                self.assertTrue(item.get('must') or item.get('get') or item.get('note'), item.get('label'))

    def test_references_resolve_to_repo_declarations_or_external_pointers(self):
        for sid, d in T['decls'].items():
            lines = d['t'].split('\n')
            for (l0, c0, l1, c1, target) in d['r']:
                self.assertTrue(target in T['decls'] or target in T['ext'], (d['n'], target))
                self.assertNotEqual(target, sid)
                self.assertLessEqual(l1, len(lines) - 1, d['n'])
                if l0 == l1:
                    token = lines[l0][c0:c1]
                    self.assertTrue(token.strip(), (d['n'], l0, c0, c1))

    def test_names_index_matches_declarations(self):
        self.assertEqual(set(T['names'].values()), set(T['decls']))
        for name in ('DY.Example.SignedDH.client_secrecy', 'DY.Trace.Invariant', 'DY.Bytes.AttackerKnows_implies_Publishable', 'DY.ProtocolEvent.logEvent.spec'):
            self.assertIn(name, T['names'])

    def test_curated_entries_quote_real_source(self):
        by_label = {it['label']: T['decls'][it['id']] for c in T['categories'] for it in c['items']}
        self.assertIn('EventInv.invariant tr ev', by_label['logEvent']['t'])
        self.assertIn('msg.Publishable tr', by_label['sendMessage']['t'])
        self.assertIn('ClientFinishEvent', by_label['SignedDHEventInv']['t'])
        self.assertIn('HoareTriplePure', by_label['hash (pure)']['t'])

    def test_page_assets_and_links(self):
        for asset in ('toolkit.css', 'toolkit.js', 'toolkit-data.js'):
            self.assertIn(asset, HTML)
            self.assertTrue((DIST/asset).exists(), asset)
        self.assertIn('toolkit.html', (DIST/'proof.html').read_text())
        self.assertIn('toolkit.html', (DIST/'walkthrough.html').read_text())
