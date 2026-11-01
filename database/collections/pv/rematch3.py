# -*- coding: utf-8 -*-
"""python rematch3.py <pv_raw.json> <msc_dir> <match.json> [--apply] -> third pass for the still unmatched:
the normalized first MSC line (first 28 chars) searched in the first 300 chars of every PV song text;
a single PV song containing it is proposed (with --apply: accepted)."""
import io, json, os, sys
from textnorm import norm
from pvtext import normalize

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
pv = {s['num']: s for s in json.load(open(sys.argv[1], encoding='utf-8'))}
msc_dir, mpath = sys.argv[2], sys.argv[3]
apply = '--apply' in sys.argv
match = json.load(open(mpath, encoding='utf-8'))
# checked by hand: same first line, other words after it (the tune may differ) — no notes
REJECT = {'190', '335', '452'}
heads = {}
for n, s in pv.items():
    heads[n] = norm(' '.join(l for st in normalize(s['stanzas']) for l in st['lines']))[:300]
taken = set(n for v in match.values() for n in v['pv'])
props = []
for k, v in sorted(match.items(), key=lambda x: int(x[0])):
    if v['pv']:
        continue
    w = json.load(open(os.path.join(msc_dir, 'PV-%03d.json' % int(k)), encoding='utf-8'))
    st = (w.get('lyrics') or {}).get('stanzas') or []
    if not st:
        continue
    key = norm(st[0]['lines'][0])[:28]
    hits = [n for n, h in heads.items() if key in h]
    props.append((k, key, hits, [(n, pv[n]['title']) for n in hits[:3]], [n for n in hits if n in taken]))
    if apply and len(hits) == 1 and hits[0] not in taken and k not in REJECT:
        v['pv'] = hits
        v['score'] = 0.8
        v['third_pass'] = True
for p in props:
    print(p)
if apply:
    json.dump(match, open(mpath, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('accepted', sum(1 for v in match.values() if v.get('third_pass')))
