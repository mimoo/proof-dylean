#!/usr/bin/env python3
"""Generate the walkthrough voice-over with ElevenLabs.

Reads web/walkthrough/script.json, writes web/walkthrough/audio/<id>.mp3 and
web/walkthrough/narration.js (text, per-word timings, duration). Steps whose
text, voice, and model are unchanged are not regenerated.

Needs ELEVENLABS_API_KEY in the environment, or --env-file pointing at a file
containing an ELEVENLABS_API_KEY=... line.
"""
import argparse
import base64
import hashlib
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
WALK = ROOT/'web'/'walkthrough'
AUDIO = WALK/'audio'
OUT = WALK/'narration.js'
PREFIX = 'window.DYLEAN_NARRATION='
VOICE_SETTINGS = dict(stability=0.5, similarity_boost=0.8, style=0.25, use_speaker_boost=True)


def load_key(env_file):
    key = os.environ.get('ELEVENLABS_API_KEY')
    if not key and env_file:
        for line in pathlib.Path(env_file).read_text().splitlines():
            if line.startswith('ELEVENLABS_API_KEY='):
                key = line.split('=', 1)[1].strip().strip('"').strip("'")
    if not key:
        sys.exit('ELEVENLABS_API_KEY is not set (or pass --env-file)')
    return key


def existing():
    if not OUT.exists():
        return {}
    text = OUT.read_text()
    return json.loads(text[len(PREFIX):].rstrip().rstrip(';'))


def spoken(text, pronounce):
    for display, say in pronounce.items():
        text = text.replace(display, say)
    return text


def digest(text, voice, model):
    return hashlib.sha256(json.dumps([text, voice, model, VOICE_SETTINGS], sort_keys=True).encode()).hexdigest()[:16]


def words_from_alignment(alignment):
    chars, starts, ends = alignment['characters'], alignment['character_start_times_seconds'], alignment['character_end_times_seconds']
    words, current = [], None
    for ch, s, e in zip(chars, starts, ends):
        if ch.isspace():
            if current:
                words.append(current)
                current = None
            continue
        if current is None:
            current = [ch, round(s, 3), round(e, 3)]
        else:
            current[0] += ch
            current[2] = round(e, 3)
    if current:
        words.append(current)
    return words


def synthesize(key, voice, model, text):
    url = f'https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps?output_format=mp3_44100_64'
    body = json.dumps(dict(text=text, model_id=model, voice_settings=VOICE_SETTINGS)).encode()
    req = urllib.request.Request(url, data=body, headers={'xi-api-key': key, 'content-type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f'ElevenLabs error {e.code}: {e.read().decode(errors="replace")[:500]}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--env-file')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--only', help='comma-separated step ids')
    args = ap.parse_args()
    script = json.loads((WALK/'script.json').read_text())
    voice, model, pronounce = script['voice'], script['model'], script.get('pronounce', {})
    only = set(args.only.split(',')) if args.only else None
    old = existing()
    out = {}
    key = None
    AUDIO.mkdir(parents=True, exist_ok=True)
    for step in script['steps']:
        sid, text = step['id'], step['text'].strip()
        say = spoken(text, pronounce)
        h = digest(say, voice, model)
        prev = old.get(sid)
        mp3 = AUDIO/f'{sid}.mp3'
        if prev and prev.get('hash') == h and mp3.exists() and not args.force and (only is None or sid not in only):
            out[sid] = prev
            print(f'  {sid}: unchanged')
            continue
        if only is not None and sid not in only and prev and mp3.exists():
            out[sid] = prev
            continue
        key = key or load_key(args.env_file)
        print(f'  {sid}: synthesizing {len(text)} chars…', flush=True)
        res = synthesize(key, voice, model, say)
        mp3.write_bytes(base64.b64decode(res['audio_base64']))
        words = words_from_alignment(res['alignment'])
        for w in words:  # show the written form, keep the spoken timing
            for display, said in pronounce.items():
                w[0] = w[0].replace(said, display)
        out[sid] = dict(text=text, words=words, duration=words[-1][2] if words else 0, hash=h, src=f'walkthrough/audio/{sid}.mp3')
    OUT.write_text(PREFIX + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
    total = sum(v['duration'] for v in out.values())
    print(f'wrote {OUT.relative_to(ROOT)} · {len(out)} steps · {total/60:.1f} min of audio')


if __name__ == '__main__':
    main()
