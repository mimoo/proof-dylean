#!/usr/bin/env python3
"""Run scripts/ExportTrace.lean against the DyLean checkout and write web/trace/trace.json.

The sanity-check scenarios are executed, not proven: the output is the execution
trace each Traceful program produces from the empty trace, entry by entry.
"""
import argparse
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT/'web'/'trace'/'trace.json'


def bundle():
    """trace-data.js = trace.json + annotations.json as one classic script, so the page works from file://."""
    data = json.loads(OUT.read_text())
    ann = json.loads((OUT.parent/'annotations.json').read_text())
    (OUT.parent/'trace-data.js').write_text('window.DYLEAN_TRACE=' + json.dumps(dict(scenarios=data['scenarios'], meta=data.get('meta'), annotations=ann), ensure_ascii=False, separators=(',', ':')) + ';\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', default=str(ROOT.parent/'dylean'), help='DyLean checkout (default: ../dylean)')
    ap.add_argument('--bundle-only', action='store_true', help='only rebuild trace-data.js from the existing trace.json and annotations.json')
    args = ap.parse_args()
    if args.bundle_only:
        bundle(); print('wrote', (OUT.parent/'trace-data.js').relative_to(ROOT)); return
    source = pathlib.Path(args.source).resolve()
    if not (source/'lakefile.toml').exists():
        sys.exit(f'not a DyLean checkout: {source}')
    tmp = OUT.with_suffix('.json.tmp')
    result = subprocess.run(['lake', 'env', 'lean', '--run', str(ROOT/'scripts'/'ExportTrace.lean'), str(tmp)], cwd=source, capture_output=True, text=True)
    errors = [l for l in result.stderr.splitlines() + result.stdout.splitlines() if 'error' in l]
    if result.returncode or errors or not tmp.exists():
        sys.exit('ExportTrace failed:\n' + result.stdout + result.stderr)
    data = json.loads(tmp.read_text())
    revision = subprocess.run(['git', '-C', str(source), 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip()
    data['meta'] = dict(revision=revision, exporter=1)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n')
    tmp.unlink()
    bundle()
    for sc in data['scenarios']:
        kinds = [e['kind'] for e in sc['entries']]
        print(f"{sc['name']}: {sc['length']} entries, succeeded={sc['succeeded']}, unknown={kinds.count('unknown')}")
    print('wrote', OUT.relative_to(ROOT))


if __name__ == '__main__':
    main()
