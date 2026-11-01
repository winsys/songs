# -*- coding: utf-8 -*-
"""python render_all.py <match.json> <out_dir> [pv nums ...]
Sheet music of every matched MSC song as the PV song's images: tune а (or the only one) ->
<out>/<PV>.jpg (group «НОТЫ»), б / в / г -> <out>/tune2|tune3|tune4/<PV>.jpg; the printed MSC
number is replaced by the PV number. When two MSC songs claim one PV number the better match wins."""
import io, json, os, sys, time
from render_msc import render

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
match = json.load(open(sys.argv[1], encoding='utf-8'))
out = sys.argv[2]
only = set(int(x) for x in sys.argv[3:])
DIRS = {'а': '', 'б': 'tune2', 'в': 'tune3', 'г': 'tune4'}
claims = {}
for msc, m in match.items():
    for pv in m['pv']:
        if pv not in claims or m['score'] > match[claims[pv]]['score']:
            claims[pv] = msc
jobs = []
for pv, msc in sorted(claims.items()):
    if only and pv not in only:
        continue
    for var, pdf in sorted(match[msc]['pdfs'].items()):
        jobs.append((pv, msc, var, pdf))
for d in DIRS.values():
    os.makedirs(os.path.join(out, d), exist_ok=True)
t0 = time.time()
fails = []
for k, (pv, msc, var, pdf) in enumerate(jobs):
    dst = os.path.join(out, DIRS[var], '%d.jpg' % pv)
    try:
        w, h, info = render(pdf, dst, str(pv))
        if info.get('title') == 'not found':
            fails.append((pv, msc, var, 'title not found'))
    except Exception as e:
        fails.append((pv, msc, var, repr(e)))
    if k % 100 == 0:
        print('rendered', k, 'of', len(jobs), '%.0fs' % (time.time() - t0), flush=True)
print('done', len(jobs), 'images,', len(claims), 'PV songs; problems:', len(fails))
for f in fails:
    print('  ', f)
