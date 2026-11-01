# -*- coding: utf-8 -*-
"""Turn detect.py output + verified heading labels into per-song fragments.

labels.json: {"<spread>:<side>:<top>": "<label>"} for every detected heading, where
label is the printed number ("15", "4а", "84б") or "FP" (not a heading).
ADDED_HEADINGS: headings the detector missed, with their label.
"""
import json, os, re
from nums import gusli_num


def key(sn, side, h):
    return '%s:%s:%d' % (sn, side, h['top'])


def ordered_heads(det, adds=()):
    """[(spread, side, head)] in book order."""
    extra = {}
    for a in adds:
        extra.setdefault((int(a['spread']), a['side']), []).append(
            {'top': a['top'], 'bottom': a['bottom'], 'x0': a.get('x0', 300), 'x1': a.get('x1', 1100),
             'n': 0, 'label': a['label']})
    out = []
    for sn in sorted(det, key=int):
        for pg in det[sn]:
            if not pg.get('staves'):
                continue
            hs = list(pg['heads']) + extra.get((int(sn), pg['side']), [])
            for h in sorted(hs, key=lambda h: h['top']):
                out.append((int(sn), pg['side'], h))
    return out


def song_num(label):
    """Printed label -> (NUM, tune): '15' -> ('g015', 1); '4а' -> ('g004', 1), '4б' -> ('g004', 2)
    (two tunes of one song: the second goes to the second image group); '84а' / '84б' are
    two different songs -> ('g084a', 1) / ('g084b', 1)."""
    m = re.match(r'^(\d+)([аб]?)$', label)
    n, v = int(m.group(1)), m.group(2)
    if n == 84:
        return (gusli_num(84, v), 1)
    return (gusli_num(n), 2 if v == 'б' else 1)


# Headings the detector misses (a short title of few glyphs looks like a row of note
# heads): page coordinates after detect.py's deskew.
ADDED_HEADINGS = [
    {'spread': 276, 'side': 'R', 'top': 1982, 'bottom': 2023, 'x0': 820, 'x1': 1075, 'label': '507'},
]

# Songs followed (mid-page) by a book section title («IV. ХВАЛА И БЛАГОДАРЕНИЕ» …):
# their last part is cut at the first blank gap after its last staff.
TRIM_TAIL = {(gusli_num(146), 1), (gusli_num(218), 1), (gusli_num(281), 1), (gusli_num(500), 1)}


def fragments(det, labels, adds=()):
    """{(song_num, tune): [(spread, side, y0, y1)]}, [(label, spread, side, head)], labels."""
    heads = ordered_heads(det, adds)
    lab = []
    for sn, side, h in heads:
        l = h.get('label') or labels.get(key(sn, side, h))
        lab.append(l)
    real = [(l, sn, side, h) for l, (sn, side, h) in zip(lab, heads) if l and l != 'FP']
    frags = {}
    cur = None
    for sn in sorted(det, key=int):
        for pg in det[sn]:
            if not pg.get('staves'):
                continue
            spread = int(sn)
            ptop, pbot = pg['content_top'], pg['content_bottom']
            hs = sorted((h['top'], l) for (l, s2, sd, h) in real if s2 == spread and sd == pg['side'])
            # A part that starts at a heading always belongs to its song; a continuation at
            # the top of a page counts when it holds a staff (staff bands can be missed on
            # a curled page, so a tall part counts too — a book section title like
            # «VIII. ПУТЬ ВЕРЫ» over the first heading of a page is < 300 px and is dropped).
            y = ptop
            from_head = False
            for top, l in hs + [(None, None)]:
                y1 = pbot if top is None else top - 14
                if cur and y1 - y > 40 and (from_head or y1 - y > 350
                                            or any(a < y1 and b > y for a, b in pg['bands'])):
                    frags.setdefault(cur, []).append((spread, pg['side'], y, y1))
                if top is not None:
                    cur = song_num(l)
                    y = top - 14
                    from_head = True
    return frags, real, lab
