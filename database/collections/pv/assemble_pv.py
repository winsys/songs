# -*- coding: utf-8 -*-
"""python assemble_pv.py <vif.json> <hvs_gap.json> <out_raw.json>
«Песнь Возрождения» 3055 = vifania.org.ua (3000 songs) with its numbering slips fixed and the gaps
filled from hvalite.com (3300 ed., same numbers there): writes [{num, src, title, stanzas}]."""
import io, json, sys
from collections import Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
vif = {s['num']: dict(s, src='vifania') for s in json.load(open(sys.argv[1], encoding='utf-8'))}
hvs = {s['num']: dict(s, src='hvalite') for s in json.load(open(sys.argv[2], encoding='utf-8'))}

# vifania stores these songs one number off (1315 → 1314 …), overwriting the song of that number:
# the neighbours agree with the 2800 / 3300 editions, the song moved here is missing elsewhere
MOVES = {1314: 1315, 1423: 1432, 1781: 1791}
FILL = list(range(800, 850)) + [1314, 1423, 1716, 1781]
for a, b in MOVES.items():
    assert b not in vif, b
    vif[b] = dict(vif.pop(a), num=b)
for n in FILL:
    assert n not in vif, n
    vif[n] = dict(hvs[n], num=n)
songs = [vif[k] for k in sorted(vif)]
json.dump(songs, open(sys.argv[3], 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('songs', len(songs), 'sources', Counter(s['src'] for s in songs),
      'missing', [n for n in range(1, 3056) if n not in vif])
