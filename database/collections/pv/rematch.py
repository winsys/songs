# -*- coding: utf-8 -*-
"""python rematch.py <pv_raw.json> <msc_dir> <match.json> -> second pass over the unmatched MSC songs:
accept the best candidate (70-char score >= 0.7) when its first or second line is the same
(line similarity >= 0.9 on the normalized lines). Updates match.json in place, prints the rest."""
import difflib, io, json, os, sys
from textnorm import norm
from pvtext import normalize

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
pv = {s['num']: s for s in json.load(open(sys.argv[1], encoding='utf-8'))}
msc_dir, mpath = sys.argv[2], sys.argv[3]
match = json.load(open(mpath, encoding='utf-8'))


def lines_of_pv(n):
    st = normalize(pv[n]['stanzas'])
    return [norm(l) for l in st[0]['lines']] if st else []


def sim(a, b):
    k = min(len(a), len(b))
    return difflib.SequenceMatcher(None, a[:k], b[:k], autojunk=False).ratio() if k >= 8 else 0


added, rest = [], []
for k, v in match.items():
    if v['pv'] or not v.get('cands'):
        if not v['pv']:
            rest.append((k, v['score'], v.get('msc_first', v.get('why'))))
        continue
    w = json.load(open(os.path.join(msc_dir, 'PV-%03d.json' % int(k)), encoding='utf-8'))
    ml = [norm(l) for l in w['lyrics']['stanzas'][0]['lines']]
    ok = None
    for n, r in v['cands']:
        pl = lines_of_pv(n)
        if r >= 0.7 and pl and ml and (sim(ml[0], pl[0]) >= 0.9 or (len(ml) > 1 and len(pl) > 1 and sim(ml[1], pl[1]) >= 0.9)):
            ok = (n, r)
            break
    if ok:
        v['pv'] = [ok[0]]
        v['score'] = ok[1]
        v['second_pass'] = True
        added.append((k, ok[0], ok[1], v['msc_first'][:60], ' / '.join(pv[ok[0]]['stanzas'][0]['lines'][:2])[:60]))
    else:
        rest.append((k, v['score'], v['msc_first'][:70], v['cands'][:1]))
json.dump(match, open(mpath, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('second pass accepted', len(added))
for a in added:
    print('  +', a)
print('still unmatched', len(rest))
for r in sorted(rest, key=lambda x: -x[1]):
    print('  -', r)
