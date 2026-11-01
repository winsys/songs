# -*- coding: utf-8 -*-
"""Sanity checks of gusli.json: merged stanzas, leftover markup, odd characters."""
import io, json, re, sys
from statistics import median

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
d = json.load(io.open(sys.argv[1], encoding='utf-8'))
for s in d['songs']:
    t = s['texts']['ru']
    lines = t.split('\r\n')
    verses = [l for l in lines if re.match(r'^\d+\. ', l)]
    if len(verses) >= 3:
        lens = [len(v) for v in verses]
        m = median(lens)
        for v in verses:
            if len(v) > 1.7 * m:
                print('LONG', s['num'], len(v), int(m), v[:90])
    bad = re.findall(r'[{}\[\]<>|@=_#*]|[A-Za-z]{2,}|[ѣіѳѵЪ]|ъ\b', t)
    if bad:
        print('MARKUP', s['num'], sorted(set(bad))[:10])
    if not verses:
        print('NOVERSE', s['num'], s['name'], len(lines))
