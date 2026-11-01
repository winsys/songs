# -*- coding: utf-8 -*-
"""python match_msc.py <pv_raw.json> <msc_dir> <msc_pdf_root> <out.json>
Match every MSC «Песни христиан т.1» song (lyrics from /api/works/PV-NNN) to PV numbers by the
first L characters of the first stanza (line splits differ between the sources).
Output: {msc_num: {"pv": [nums], "score": s, "msc_title": t, "pdfs": {variant: path}}} + report."""
import difflib, io, json, os, re, sys
from collections import defaultdict
from textnorm import norm
from pvtext import normalize

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
pv_path, msc_dir, pdf_root, out = sys.argv[1:5]
pv = json.load(open(pv_path, encoding='utf-8'))
L = 70
ACCEPT = 0.85


def head(lines):
    return norm(' '.join(lines))[:L]


pv_heads = []
for s in pv:
    st = normalize(s['stanzas'])
    if st:
        pv_heads.append((s['num'], head(st[0]['lines'])))

pdfs = defaultdict(dict)
for d in os.listdir(pdf_root):
    for f in os.listdir(os.path.join(pdf_root, d)):
        m = re.match(r'^(\d+)([абвг]?)\s', f)
        if m:
            pdfs[int(m.group(1))][m.group(2) or 'а'] = os.path.join(pdf_root, d, f)

res = {}
report = defaultdict(int)
weak = []
for f in sorted(os.listdir(msc_dir)):
    w = json.load(open(os.path.join(msc_dir, f), encoding='utf-8'))
    num = int(w['idx'].split('-')[1])
    st = [x for x in (w.get('lyrics') or {}).get('stanzas', []) if x.get('lines')]
    if not st:
        report['no lyrics'] += 1
        res[num] = {'pv': [], 'score': 0, 'msc_title': w['title'], 'pdfs': pdfs.get(num, {}), 'why': 'no lyrics'}
        continue
    m2 = head(st[0]['lines'])
    scored = []
    for n, h2 in pv_heads:
        k = min(len(m2), len(h2))
        if k < 20:
            continue
        sm = difflib.SequenceMatcher(None, m2[:k], h2[:k], autojunk=False)
        if sm.real_quick_ratio() < 0.7 or sm.quick_ratio() < 0.7:
            continue
        r = sm.ratio()
        if r >= 0.7:
            scored.append((r, n))
    scored.sort(reverse=True)
    best = scored[0][0] if scored else 0
    top = [n for r, n in scored if r >= best - 0.02 and r >= ACCEPT]
    kind = 'none' if best < ACCEPT else ('unique' if len(top) == 1 else 'multi')
    report[kind] += 1
    if scored and best < 0.95:
        weak.append((num, round(best, 2), kind, ' / '.join(st[0]['lines'][:2]),
                     [(n, round(r, 2)) for r, n in scored[:3]]))
    res[num] = {'pv': top, 'score': round(best, 3), 'msc_title': w['title'], 'pdfs': pdfs.get(num, {}),
                'msc_first': ' / '.join(st[0]['lines'][:2]), 'cands': [(n, round(r, 3)) for r, n in scored[:3]]}
json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('msc works', len(res), dict(report))
pv_used = defaultdict(list)
for k, v in res.items():
    for n in v['pv']:
        pv_used[n].append(k)
print('PV numbers with notes', len(pv_used), '| claimed by >1 MSC song:',
      {n: v for n, v in pv_used.items() if len(v) > 1})
print('below 0.95:', len(weak))
for x in sorted(weak, key=lambda x: x[1], reverse=True):
    print('  ', x)
