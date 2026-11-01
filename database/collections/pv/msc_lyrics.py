# -*- coding: utf-8 -*-
"""python -I msc_lyrics.py <msc_PV.json> <out_dir> [delay] -> /api/works/<idx> for every unique idx,
saved as <out_dir>/<idx>.json (skips existing files, backs off on errors)."""
import io, json, os, sys, time, urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
UA = 'SongsCollectionImport/1.0 (+https://github.com/winsys/songs)'
src, out = sys.argv[1], sys.argv[2]
delay = float(sys.argv[3]) if len(sys.argv) > 3 else 0.8
os.makedirs(out, exist_ok=True)
idxs = sorted(set(w['idx'] for w in json.load(open(src, encoding='utf-8'))))
print('works', len(idxs), flush=True)
for k, idx in enumerate(idxs):
    dst = os.path.join(out, idx + '.json')
    if os.path.exists(dst):
        continue
    for attempt in range(5):
        try:
            req = urllib.request.Request('https://mscmusic.org/api/works/' + idx, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                open(dst, 'wb').write(r.read())
            break
        except Exception as e:
            print(idx, 'attempt', attempt, e, flush=True)
            time.sleep(5 * (2 ** attempt))
    if k % 50 == 0:
        print('done', k, flush=True)
    time.sleep(delay)
print('finished', flush=True)
