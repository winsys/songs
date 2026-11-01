# -*- coding: utf-8 -*-
"""Per spread: pages (deskewed crops), staff bands, running header, song headings.

python detect.py <full_dir> <out_json> [first last] [--debug <dir>]
"""
import json, os, sys
import cv2
import numpy as np
from layout import binarize, staff_segments, rotate, staff_bands, runs, hlines


def page_boxes(gray, ink):
    H, W = gray.shape
    segs = staff_segments(ink, W // 8)
    pages = []
    for side, ps in (('L', [s for s in segs if (s[0] + s[1]) / 2 < W / 2]),
                     ('R', [s for s in segs if (s[0] + s[1]) / 2 >= W / 2])):
        if len(ps) < 5:
            pages.append({'side': side, 'staves': False})
            continue
        x0 = int(np.percentile([s[0] for s in ps], 10))
        x1 = int(np.percentile([s[1] for s in ps], 90))
        ang = float(np.degrees(np.arctan(np.median([s[3] for s in ps]))))
        pages.append({'side': side, 'staves': True, 'x0': x0, 'x1': x1, 'angle': ang})
    return pages


def text_ccs(rink, bands, x0, x1, sp):
    """Connected components of the ink outside the staff bands (staff lines removed)."""
    ink = rink.copy()
    ink[:, :max(0, x0 - 40)] = 0
    ink[:, x1 + 40:] = 0
    lines = hlines(ink, 60)
    ink = ink & (1 - lines)
    mask = np.zeros_like(ink)
    for a, b in bands:
        mask[max(0, a - int(sp * 0.4)):b + int(sp * 0.4) + 1, :] = 1
    n, lab, st, cen = cv2.connectedComponentsWithStats(ink, 8)
    dt = cv2.distanceTransform(ink, cv2.DIST_L2, 3)
    out = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if a < 25 or h < 8:
            continue
        if mask[y:y + h, x:x + w].any():
            continue
        thick = float(dt[y:y + h, x:x + w][lab[y:y + h, x:x + w] == i].max())
        out.append((int(x), int(y), int(w), int(h), int(a), thick))
    return out


def heading_lines(ccs, x0, x1, paper_top):
    """Clusters of big bold glyphs on one text line = song heading lines
    (heading font: x-height ~25-28 px, caps ~36, stroke DT 3.7-4.8 at full res;
    lyrics: x-height ~17, stroke 2.3-2.9; filled note heads: DT >= 5.7)."""
    big = [c for c in ccs if 22 <= c[3] <= 46 and c[2] <= 90 and 3.4 <= c[5] <= 5.4
           and c[1] > paper_top]
    big.sort(key=lambda c: c[1] + c[3] / 2.0)
    groups = []
    for c in big:
        mid = c[1] + c[3] / 2.0
        for g in groups:
            if abs(g['mid'] - mid) <= 14:
                g['cc'].append(c)
                g['mid'] = float(np.median([d[1] + d[3] / 2.0 for d in g['cc']]))
                break
        else:
            groups.append({'mid': mid, 'cc': [c]})
    out = []
    width = x1 - x0
    for g in groups:
        cc = sorted(g['cc'])
        xh = [c for c in cc if 23 <= c[3] <= 31]
        if len(cc) < 6 or len(xh) < 3:
            continue
        gx0 = min(c[0] for c in cc)
        gx1 = max(c[0] + c[2] for c in cc)
        if gx1 - gx0 < width * 0.15:
            continue
        out.append({'top': min(c[1] for c in cc), 'bottom': max(c[1] + c[3] for c in cc),
                    'x0': gx0, 'x1': gx1, 'n': len(cc),
                    'h': int(np.median([c[3] for c in cc])),
                    'thick': round(float(np.median([c[5] for c in cc])), 2)})
    out.sort(key=lambda h: h['x0'])
    # merge fragments of one heading split by residual page curvature
    merged = []
    for h in sorted(out, key=lambda h: h['top']):
        for m in merged:
            ov = min(m['bottom'], h['bottom']) - max(m['top'], h['top'])
            gap = max(h['x0'] - m['x1'], m['x0'] - h['x1'])
            if ov > 0.4 * min(m['bottom'] - m['top'], h['bottom'] - h['top']) and gap < 250:
                m.update({'top': min(m['top'], h['top']), 'bottom': max(m['bottom'], h['bottom']),
                          'x0': min(m['x0'], h['x0']), 'x1': max(m['x1'], h['x1']), 'n': m['n'] + h['n']})
                break
        else:
            merged.append(dict(h))
    # running headers ("ГУСЛИ — II": one row of small caps, < 40 px tall) and stray
    # rows of note heads (few, tall glyphs) are not headings
    merged = [m for m in merged if not (m['n'] <= 8 and (m['bottom'] - m['top'] < 40 or m['h'] >= 30))]
    merged.sort(key=lambda h: h['top'])
    return merged


def content_limits(rot, rink, lx0, lx1, ptop, bands, heads):
    """(content_top, content_bottom, paper_bottom): content starts below the running
    header (first small ink row-run under the paper edge that is not a heading) and
    ends at the last ink row above the paper's bottom edge."""
    H = rot.shape[0]
    prof = rot[:, lx0:lx1].mean(axis=1)
    # paper bottom: where the shading of the page's lower edge starts
    pbot = H - 1
    start = bands[-1][1] if bands else ptop
    for y in range(int(start), H):
        if prof[y] < 100:
            pbot = y
            break
    rowink = rink[:, lx0:lx1].sum(axis=1)
    on = rowink > 8
    on[:ptop + 60] = False                  # artifacts along the top edge
    on[max(0, min(pbot, H - 1) - 40):] = False   # shading along the bottom edge
    rr = [r for r in runs(on) if r[1] - r[0] >= 3]
    first_band = bands[0][0] if bands else H
    first_head = min([h['top'] for h in heads] + [H])
    # running header ("ГУСЛИ — II" + page number) sits ~100-230 px under the edge
    ctop = ptop + 60
    for a, b in rr:
        if a > ptop + 230 or b >= first_band - 40 or b >= first_head - 4 or b - a >= 60:
            break
        if a >= ptop + 90:
            ctop = b + 28   # page numbers can hang a little below the header line
    cbot = (rr[-1][1] + 12) if rr else pbot
    return int(ctop), int(min(cbot, pbot)), int(pbot)


def paper_top(rot, lx0, lx1, first_band):
    """Bottom of the black background band above the page (searching up from the first staff)."""
    prof = rot[:, lx0:lx1].mean(axis=1)
    dark = 0
    for y in range(int(first_band), -1, -1):
        if prof[y] < 30:
            dark += 1
            if dark >= 15:
                return y + dark
        else:
            dark = 0
    return 0


def analyse(path):
    gray = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    H, W = gray.shape
    ink = binarize(gray)
    res = []
    for pg in page_boxes(gray, ink):
        if not pg['staves']:
            res.append(pg)
            continue
        x0, x1, ang = pg['x0'], pg['x1'], pg['angle']
        pad = int((x1 - x0) * 0.08)
        cx0, cx1 = max(0, x0 - pad), min(W, x1 + pad)
        crop = gray[:, cx0:cx1]
        rot = rotate(crop, ang, ((cx1 - cx0) / 2.0, H / 2.0), 0)
        rink = binarize(rot)
        lx0, lx1 = x0 - cx0, x1 - cx0
        bands, _ = staff_bands(rot, lx0, lx1)
        sp = 15.5
        # the page's top edge can look like a staff band: find the edge from the middle
        # of the page upwards and drop "bands" on or above it
        ptop = paper_top(rot, lx0, lx1, H // 2)
        bands = [b for b in bands if b[0] > ptop + 40]
        ccs = text_ccs(rink, bands, lx0, lx1, sp)
        heads = heading_lines(ccs, lx0, lx1, ptop)
        ctop, cbot, pbot = content_limits(rot, rink, lx0, lx1, ptop, bands, heads)
        pg.update({'cx0': cx0, 'cx1': cx1, 'lx0': lx0, 'lx1': lx1, 'bands': bands, 'heads': heads,
                   'paper_top': ptop, 'paper_bottom': pbot, 'content_top': ctop,
                   'content_bottom': cbot, 'H': H})
        res.append(pg)
    return res, gray


def debug_image(path, res, out):
    gray = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    H, W = gray.shape
    tiles = []
    for pg in res:
        if not pg.get('staves'):
            continue
        crop = gray[:, pg['cx0']:pg['cx1']]
        rot = rotate(crop, pg['angle'], ((pg['cx1'] - pg['cx0']) / 2.0, H / 2.0), 0)
        img = cv2.cvtColor(rot, cv2.COLOR_GRAY2BGR)
        for a, b in pg['bands']:
            cv2.rectangle(img, (pg['lx0'], a), (pg['lx1'], b), (255, 160, 0), 3)
        for hd in pg['heads']:
            cv2.rectangle(img, (hd['x0'], hd['top']), (hd['x1'], hd['bottom']), (0, 0, 255), 5)
        tiles.append(img)
    if tiles:
        h = max(t.shape[0] for t in tiles)
        img = np.hstack([cv2.copyMakeBorder(t, 0, h - t.shape[0], 0, 10, cv2.BORDER_CONSTANT, value=(0, 255, 0)) for t in tiles])
        s = 1100.0 / img.shape[1]
        cv2.imwrite(out, cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA))


if __name__ == '__main__':
    src, outj = sys.argv[1], sys.argv[2]
    first, last = 1, 287
    dbg = None
    args = sys.argv[3:]
    if '--debug' in args:
        i = args.index('--debug')
        dbg = args[i + 1]
        args = args[:i] + args[i + 2:]
        os.makedirs(dbg, exist_ok=True)
    if len(args) >= 2:
        first, last = int(args[0]), int(args[1])
    allres = {}
    if os.path.exists(outj):
        allres = json.load(open(outj))
    for n in range(first, last + 1):
        p = os.path.join(src, '%03d.png' % n)
        if not os.path.exists(p):
            continue
        res, _ = analyse(p)
        allres[str(n)] = res
        heads = ['%s:%d' % (pg['side'], len(pg.get('heads', []))) for pg in res]
        print(n, heads, flush=True)
        if dbg:
            debug_image(p, res, os.path.join(dbg, '%03d.jpg' % n))
    json.dump(allres, open(outj, 'w'), indent=0)
