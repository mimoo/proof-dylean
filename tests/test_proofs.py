"""Check the exported certificate's structure and closure, not a hand-made tree."""
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
P = json.loads((ROOT/'dist/proof-data.js').read_text().split('=', 1)[1].split(';window.', 1)[0])
D = json.loads((ROOT/'dist/data.js').read_text().removeprefix('window.DYLEAN_DATA=').removesuffix(';\n'))
NODES = []
for chunk in range((P['nodeCount'] + P['chunkSize'] - 1)//P['chunkSize']):
    NODES.extend(json.loads((ROOT/f'dist/proofs/{chunk}.js').read_text().split('=', 1)[1].removesuffix(';\n')))


def children(n):
    kind = n[0]
    if kind == 'app': return [n[1], *n[2]]
    if kind in ('lam', 'forall'): return [n[2], n[3]]
    if kind == 'let': return [n[2], n[3], n[4]]
    if kind == 'proj': return [n[3]]
    return []


class ProofTests(unittest.TestCase):
    def test_complete_graph_and_binder_scopes(self):
        self.assertEqual(len(NODES), P['nodeCount'])
        required = []
        for i, n in enumerate(NODES):
            kids = children(n)
            self.assertTrue(all(0 <= k < i for k in kids), (i, n))
            if n[0] == 'bvar': need = n[1] + 1
            elif n[0] in ('lam', 'forall'): need = max(required[n[2]], required[n[3]] - 1)
            elif n[0] == 'let': need = max(required[n[2]], required[n[3]], required[n[4]] - 1)
            else: need = max([required[k] for k in kids], default=0)
            required.append(need)
            if n[0] in ('const', 'proj'):
                self.assertIn(n[1], P['declarations'], (i, n))
            if n[0] == 'proj' and P['declarations'][n[1]]['fields']:
                self.assertLess(n[2], len(P['declarations'][n[1]]['fields']), (i, n))
        for d in P['declarations'].values():
            self.assertEqual(required[d['type']], 0, d['name'])
            if d['body'] is not None:
                self.assertEqual(required[d['body']], 0, d['name'])

    def test_real_generated_tactic_helpers_have_bodies(self):
        helpers = [d for d in P['declarations'].values() if 'SignedDH.client_secrecy._proof_' in d['name']]
        self.assertTrue(helpers)
        self.assertTrue(all(d['body'] is not None for d in helpers))
        self.assertEqual({d['name'] for d in P['declarations'].values() if d['kind'] == 'axiom'}, {'propext', 'Classical.choice', 'Quot.sound'})
        for seed in P['seeds']:
            self.assertIsNotNone(P['declarations'][seed]['body'])
            printed = (ROOT/f'dist/proofs/{seed}.txt').read_text()
            self.assertNotIn('sorry', printed)
            self.assertNotIn('⋯', printed)
        explicit = (ROOT/'dist/proofs/client_secrecy.explicit.txt').read_text()
        self.assertIn('@', explicit)
        self.assertNotIn('sorry', explicit)
        self.assertNotIn('⋯', explicit)

    def test_proof_source_links_are_compiler_targets(self):
        for d in P['declarations'].values():
            if s := d['source']:
                target = D['symbols'][s['symbol']]
                self.assertEqual(s['file'], target['file'])
                self.assertEqual(s['line'], target['range'][0] + 1)
                self.assertIn(s['kind'], ['definition', 'enclosing declaration'])
        for seed in P['seeds']:
            self.assertIsNotNone(P['declarations'][seed]['source'])
        self.assertEqual(P['meta']['sourceHash'], D['meta']['sourceHash'])
        self.assertEqual(P['meta']['toolchain'], D['meta']['toolchain'])


if __name__ == '__main__':
    unittest.main()
