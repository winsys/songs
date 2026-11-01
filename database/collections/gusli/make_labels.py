# -*- coding: utf-8 -*-
"""Assign printed numbers to the detected headings (book order) from what was read
on the contact sheets: numbers run 1..507, songs in VARIANTS are printed twice
(«Nа», «Nб» — two tunes; 84а/84б are two different songs), FP = heading indexes that
are not headings, MISSING = numbers whose heading the detector did not find
(they must then come from songs_map.ADDED_HEADINGS).

python make_labels.py <heads.json> <labels.json>
"""
import json, sys

VARIANTS = {4, 10, 42, 60, 84, 109, 117, 119, 125, 128, 137, 143, 145, 147, 152, 159, 189,
            206, 207, 219, 225, 226, 231, 237, 279, 290, 303, 305, 307, 315, 316, 325,
            395, 406, 415, 458, 476, 479, 493, 505}
FP = set()
MISSING = set()
EXPLICIT = {550: "34б", 551: "39б", 552: "68б", 553: "180б", 554: "302б"}   # heading index -> label printed out of sequence (appendix tunes, e.g. «68б»)

heads = json.load(open(sys.argv[1]))
labels = {}
n = 1
variant = ''
for i, k in enumerate(heads):
    if i in FP:
        labels[k] = 'FP'
        continue
    if i in EXPLICIT:
        labels[k] = EXPLICIT[i]
        continue
    while n in MISSING:
        n += 1
    if n in VARIANTS:
        variant = 'б' if variant == 'а' else 'а'
        labels[k] = '%d%s' % (n, variant)
        if variant == 'б':
            n += 1
            variant = ''
    else:
        labels[k] = str(n)
        n += 1
json.dump(labels, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('headings', len(heads), 'last number', n - 1)
