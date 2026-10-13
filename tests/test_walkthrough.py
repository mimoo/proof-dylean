"""The guided walkthrough page: every step has narration, audio, and a real source target."""
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT/'dist'
HTML = (DIST/'walkthrough.html').read_text()
NARRATION = json.loads((DIST/'walkthrough/narration.js').read_text().removeprefix('window.DYLEAN_NARRATION=').rstrip().rstrip(';'))
SCRIPT = json.loads((DIST/'walkthrough/script.json').read_text())
FILES = json.loads((DIST/'data.js').read_text().removeprefix('window.DYLEAN_DATA=').removesuffix(';\n'))['files']
STEPS = re.findall(r'<article class="step" data-step="([\w-]+)"[^>]*data-source="([^"]+)"', HTML)


class WalkthroughTests(unittest.TestCase):
    def test_steps_match_script_and_narration(self):
        ids = [s for s, _ in STEPS]
        self.assertGreaterEqual(len(ids), 8)
        self.assertEqual(ids, [s['id'] for s in SCRIPT['steps']])
        self.assertEqual(set(ids), set(NARRATION))

    def test_narration_has_audio_and_monotone_word_timings(self):
        for sid, n in NARRATION.items():
            self.assertTrue((DIST/n['src']).exists(), n['src'])
            self.assertGreater(n['duration'], 5, sid)
            starts = [w[1] for w in n['words']]
            self.assertEqual(starts, sorted(starts), sid)
            self.assertEqual(' '.join(w[0] for w in n['words']), n['text'], sid)

    def test_pronunciation_respellings_do_not_leak_into_text(self):
        for said in SCRIPT.get('pronounce', {}).values():
            for sid, n in NARRATION.items():
                self.assertNotIn(said, n['text'], sid)

    def test_source_links_point_at_exported_files(self):
        for sid, source in STEPS:
            file, line = re.fullmatch(r'file=(.+)&amp;line=(\d+)', 'file='+source).groups()
            file = file.replace('%2F', '/')
            self.assertIn(file, FILES, (sid, file))
            if 'text' in FILES[file]:
                self.assertLessEqual(int(line), len(FILES[file]['text'].splitlines()), (sid, file))

    def test_every_spotlight_cue_phrase_is_in_its_narration(self):
        norm = lambda w: re.sub(r'[^\w]+', '', w.lower())
        for sid, body in re.findall(r'<article class="step" data-step="([\w-]+)"[^>]*>(.*?)</article>', HTML, re.S):
            toks = [norm(w[0]) for w in NARRATION[sid]['words']]
            for cue in re.findall(r'data-cue="([^"]+)"', body):
                for phrase in cue.replace('&#39;', "'").split('|'):
                    want = [norm(w) for w in phrase.split()]
                    hits = [i for i in range(len(toks) - len(want) + 1) if toks[i:i+len(want)] == want]
                    self.assertTrue(hits, (sid, phrase))

    def test_page_assets_are_in_dist(self):
        for asset in ('walkthrough.css', 'walkthrough.js', 'walkthrough/narration.js'):
            self.assertIn(asset, HTML)
            self.assertTrue((DIST/asset).exists(), asset)
        self.assertIn('walkthrough.html', (DIST/'proof.html').read_text())
