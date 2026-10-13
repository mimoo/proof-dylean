"""The trace page: the exported run matches the annotations, and every linked declaration exists."""
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT/'dist'
D = json.loads((DIST/'trace/trace-data.js').read_text().removeprefix('window.DYLEAN_TRACE=').removesuffix(';\n'))
T = json.loads((DIST/'toolkit-data.js').read_text().removeprefix('window.DYLEAN_TOOLKIT=').removesuffix(';\n'))
A = D['annotations']
RUNS = {s['name']: s for s in D['scenarios']}


def resolved(name):
    sc = A['scenarios'][name]
    if 'extends' not in sc:
        return sc['steps'], sc['entries']
    steps, entries = resolved(sc['extends'])
    return steps + sc['steps'], {**entries, **sc['entries']}


class TraceTests(unittest.TestCase):
    def test_runs_complete_and_every_entry_is_classified(self):
        self.assertEqual(set(RUNS), set(A['scenarios']))
        for run in RUNS.values():
            self.assertTrue(run['succeeded'], run['name'])
            self.assertEqual(len(run['entries']), run['length'])
            self.assertEqual([e['i'] for e in run['entries']], list(range(run['length'])))
            self.assertNotIn('unknown', {e['kind'] for e in run['entries']}, run['name'])

    def test_every_entry_is_appended_by_exactly_one_annotated_action(self):
        for name, run in RUNS.items():
            steps, entries = resolved(name)
            appended = [a['appends'] for s in steps for a in s['actions'] if 'appends' in a]
            self.assertEqual(sorted(appended), list(range(run['length'])), name)
            self.assertEqual(sorted(int(k) for k in entries), list(range(run['length'])), name)
            for s in steps:
                lo, hi = s['range']
                inside = [a['appends'] for a in s['actions'] if 'appends' in a]
                self.assertEqual(inside, list(range(lo, hi + 1)), s['name'])
                for a in s['actions']:
                    for r in a.get('reads', []):
                        self.assertLess(r, lo, (s['name'], r))

    def test_annotations_agree_with_the_exported_entries(self):
        kinds = {'genRand': 'random', 'sendMessage': 'message', 'logEvent': 'event', 'storeLocalState': 'store', 'storeGlobalState': 'storeGlobal', 'compromise': 'compromise'}
        for name, run in RUNS.items():
            steps, _ = resolved(name)
            by_i = {e['i']: e for e in run['entries']}
            for s in steps:
                for a in s['actions']:
                    if 'appends' not in a:
                        continue
                    kind = by_i[a['appends']]['kind']
                    expected = [k for word, k in kinds.items() if word in a['lean']]
                    self.assertTrue(expected and expected[0] == kind, (name, a['appends'], a['lean'], kind))

    def test_ghost_labels_only_on_random_entries(self):
        for name, run in RUNS.items():
            _, entries = resolved(name)
            by_i = {e['i']: e for e in run['entries']}
            for k, ann in entries.items():
                self.assertEqual('ghost' in ann, by_i[int(k)]['kind'] == 'random', (name, k))

    def test_the_two_finish_events_carry_the_same_key_term(self):
        e = {x['i']: x for x in RUNS['honestAttacker']['entries']}
        self.assertEqual(e[10]['data']['event'], 'ServerFinishEvent')
        self.assertEqual(e[13]['data']['event'], 'ClientFinishEvent')
        self.assertEqual(e[10]['data']['kS'], e[13]['data']['kC'])
        leak = RUNS['compromiseClientEphAttacker']['entries'][17]['data']['msg']
        self.assertEqual(leak, e[13]['data']['kC'])

    def test_linked_declarations_exist(self):
        def found(ref):
            if not ref.startswith('@'):
                return ref in T['names']
            f, l = ref[1:].rsplit(':', 1)
            return any(d['f'] == f and d['l'] == int(l) and d['k'] == 'instance' for d in T['decls'].values())
        missing = []
        for name in A['scenarios']:
            steps, _ = resolved(name)
            for s in steps:
                missing += [r for r in (s['decl'], s['spec']) if not found(r)]
                missing += [a['triple'] for a in s['actions'] if 'triple' in a and not found(a['triple'])]
        self.assertEqual(missing, [])

    def test_page_assets_and_links(self):
        html = (DIST/'trace.html').read_text()
        for asset in ('trace.css', 'trace.js', 'trace/trace-data.js', 'cards.js', 'toolkit-data.js'):
            self.assertIn(asset, html)
            self.assertTrue((DIST/asset).exists(), asset)
        self.assertIn('trace.html', (DIST/'index.html').read_text())
