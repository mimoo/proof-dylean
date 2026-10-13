#!/usr/bin/env python3
"""Build toolkit-data.js: every repository declaration with its source span and
resolved references, plus the curated manifest from web/toolkit/manifest.json.

Used by build.py after data.js is produced; also runnable standalone against dist/.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
MANIFEST = ROOT/'web'/'toolkit'/'manifest.json'
SKIP_KINDS = {'field / constructor'}


def load_data(dist):
    text = (dist/'data.js').read_text()
    return json.loads(text.removeprefix('window.DYLEAN_DATA=').removesuffix(';\n'))


def resolve(item, by_name, by_file, files):
    """A manifest item names a declaration by exact name, or by file:line for hygienic names."""
    if 'name' in item:
        hits = by_name.get(item['name'], [])
        if not hits:
            return None
        hits.sort(key=lambda s: (s['kind'] in SKIP_KINDS, s['generated'], s['span'][2]-s['span'][0]))
        return hits[0]
    file, line = item['at'].rsplit(':', 1)
    line = int(line) - 1
    cands = [s for s in by_file.get(file, []) if s['span'][0] <= line <= s['span'][2] and s['kind'] not in SKIP_KINDS]
    if not cands:
        return None
    cands.sort(key=lambda s: (s['span'][2]-s['span'][0], s['generated']))
    return cands[0]


def build(data, manifest):
    files, symbols = data['files'], data['symbols']
    repo = {sid: s for sid, s in symbols.items() if not s['local'] and not files[s['file']]['external']}
    by_name, by_file = {}, {}
    for s in repo.values():
        by_name.setdefault(s['name'], []).append(s)
        by_file.setdefault(s['file'], []).append(s)
    decls, ext = {}, {}
    lines_cache = {}
    for sid, s in repo.items():
        if s['kind'] in SKIP_KINDS:
            continue
        f = files[s['file']]
        lines = lines_cache.setdefault(s['file'], f['text'].split('\n'))
        l0, c0, l1, c1 = s['span']
        text = '\n'.join(lines[l0:l1+1])
        refs = []
        for (rl0, rc0, rl1, rc1, target, _flag) in f['refs']:
            if target is None or target == sid or rl0 < l0 or rl1 > l1:
                continue
            t = symbols.get(target)
            if not t or t['local']:
                continue
            refs.append([rl0-l0, rc0, rl1-l0, rc1, target])
            # Library declarations, constructors and projections are not cards; they get a source pointer.
            if (target not in repo or t['kind'] in SKIP_KINDS) and target not in ext:
                ext[target] = dict(n=t['name'], f=t['file'], l=t['range'][0]+1)
        # One range may resolve to several targets (e.g. a structure and its projection): keep the most useful.
        best = {}
        for r in refs:
            key = tuple(r[:4])
            t = symbols[r[4]]
            score = (t['kind'] in SKIP_KINDS, t['generated'], r[4] not in repo, len(t['name']))
            if key not in best or score < best[key][0]:
                best[key] = (score, r)
        refs = sorted((r for _, r in best.values()), key=lambda r: (r[0], r[1]))
        decls[sid] = dict(n=s['name'], k=s['kind'], f=s['file'], l=l0+1, t=text, r=refs, p=bool(s.get('proof')), g=bool(s['generated']))
    ext = {k: v for k, v in ext.items() if k not in decls}
    cats, missing = [], []
    for cat in manifest['categories']:
        items = []
        for item in cat['items']:
            s = resolve(item, by_name, by_file, files)
            if not s or s['id'] not in decls:
                missing.append(item.get('name') or item.get('at'))
                continue
            entry = {k: v for k, v in item.items() if k not in ('name', 'at')}
            entry['id'] = s['id']
            items.append(entry)
        cats.append(dict(title=cat['title'], intro=cat.get('intro', ''), items=items))
    name_index = {d['n']: sid for sid, d in decls.items()}
    out = dict(decls=decls, ext=ext, names=name_index, categories=cats, meta=dict(revision=data['meta'].get('revision'), declarations=len(decls)))
    return out, missing


def write(dist, data=None):
    data = data or load_data(dist)
    manifest = json.loads(MANIFEST.read_text())
    out, missing = build(data, manifest)
    (dist/'toolkit-data.js').write_text('window.DYLEAN_TOOLKIT=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
    return out, missing


if __name__ == '__main__':
    dist = ROOT/(sys.argv[1] if len(sys.argv) > 1 else 'dist')
    out, missing = write(dist)
    size = (dist/'toolkit-data.js').stat().st_size
    print(f"toolkit-data.js: {out['meta']['declarations']} declarations, {sum(len(c['items']) for c in out['categories'])} curated items, {size/1e6:.1f} MB")
    if missing:
        print('unresolved manifest items:', *missing, sep='\n  ')
        sys.exit(1)
