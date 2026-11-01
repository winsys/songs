# -*- coding: utf-8 -*-
"""Render heading contact sheets and per-song sheet-music JPEGs.

python render.py sheets <full_dir> <det.json> <labels.json|none> <out_dir>
python render.py songs  <full_dir> <det.json> <labels.json> <out_dir> [num ...]
"""
import json, os, sys
import cv2
import numpy as np
from layout import rotate, binarize
from songs_map import fragments, ordered_heads, key, TRIM_TAIL, ADDED_HEADINGS

PAGE_CACHE = {}
PAGE_H = 2500          # content height of a full page at scan resolution
MAX_COL = 1.35         # a column may hold this many page heights before splitting
MAX_SIDE = 2800        # longest side of the delivered JPEG
MAX_SIDE_BIG = 3800    # ... of songs longer than 2.7 pages (choral pieces, grids)
SCALE = 0.85           # scan resolution is ~1600 px per page; 85% stays sharp on tablets
QUALITY = 72


def page_img(full, det, spread, side):
    k = (spread, side)
    if k in PAGE_CACHE:
        return PAGE_CACHE[k]
    if len(PAGE_CACHE) > 6:
        PAGE_CACHE.clear()
    pg = [p for p in det[str(spread)] if p['side'] == side][0]
    gray = cv2.imread(os.path.join(full, '%03d.png' % spread), cv2.IMREAD_GRAYSCALE)
    H = gray.shape[0]
    crop = gray[:, pg['cx0']:pg['cx1']]
    rot = rotate(crop, pg['angle'], ((pg['cx1'] - pg['cx0']) / 2.0, H / 2.0), 255)
    PAGE_CACHE[k] = (rot, pg)
    return rot, pg


def clean(gray):
    """Flatten the paper to white: divide by the estimated background, then stretch."""
    bg = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (31, 31)))
    bg = cv2.GaussianBlur(bg, (31, 31), 0)
    norm = np.clip(gray.astype(np.float32) / np.maximum(bg.astype(np.float32), 1) * 255.0, 0, 255)
    out = np.clip((norm - 90.0) * 255.0 / (205.0 - 90.0), 0, 255)   # light show-through -> white
    return out.astype(np.uint8)


def stack(parts, gap=24):
    W = max(p.shape[1] for p in parts)
    rows = []
    for i, p in enumerate(parts):
        if i:
            rows.append(np.full((gap, W), 255, np.uint8))
        pad = W - p.shape[1]
        rows.append(cv2.copyMakeBorder(p, 0, 0, pad // 2, pad - pad // 2, cv2.BORDER_CONSTANT, value=255))
    return np.vstack(rows)


def partition(hs, k):
    """Split heights hs into k contiguous groups minimising the tallest group."""
    n = len(hs)
    best = None
    def rec(start, k, acc):
        nonlocal best
        if k == 1:
            groups = acc + [list(range(start, n))]
            worst = max(sum(hs[i] for i in g) for g in groups)
            if best is None or worst < best[0]:
                best = (worst, groups)
            return
        for cut in range(start + 1, n - k + 2):
            rec(cut, k - 1, acc + [list(range(start, cut))])
    rec(0, k, [])
    return best[1]


def trim_tail(rot, pg, y0, y1):
    """New bottom of a part: the first blank gap (>= 40 rows) after its last staff
    band; y0 (= drop the part) when it holds no staff at all."""
    bands = [b for b in pg['bands'] if b[0] >= y0 and b[1] <= y1]
    if not bands:
        return y0
    ink = binarize(rot[:, pg['lx0']:pg['lx1']]).sum(axis=1)
    blank = 0
    for y in range(bands[-1][1] + 70, y1):   # past the stems below the staff
        blank = blank + 1 if ink[y] < 20 else 0
        if blank >= 40:
            return y - blank + 20
    return y1


def song_image(full, det, frs, trim=False):
    parts = []
    for i, (spread, side, y0, y1) in enumerate(frs):
        rot, pg = page_img(full, det, spread, side)
        if trim and i == len(frs) - 1:
            y1 = trim_tail(rot, pg, y0, y1)
            if y1 - y0 < 40:
                continue
        x0 = max(0, pg['lx0'] - 60)
        x1 = min(rot.shape[1], pg['lx1'] + 75)
        parts.append(clean(rot[max(0, y0):y1, x0:x1]))
    total = sum(p.shape[0] for p in parts)
    # cells of at most MAX_COL page heights: 1-3 side by side (like an open
    # book), longer choral pieces as a grid of two rows
    ncell = 1
    while total > MAX_COL * PAGE_H * ncell and ncell < len(parts):
        ncell += 1
    if ncell > 3:
        ncell = len(parts)          # long choral pieces: one page fragment per cell
    ncol = ncell if ncell <= 3 else -(-ncell // 2)
    if ncell == 1:
        img = stack(parts)
    else:
        groups = [[i] for i in range(len(parts))] if ncell == len(parts) else \
            partition([p.shape[0] for p in parts], ncell)
        cells = [stack([parts[i] for i in g]) for g in groups]
        H = max(c.shape[0] for c in cells)
        Wc = max(c.shape[1] for c in cells)
        cells = [cv2.copyMakeBorder(c, 0, H - c.shape[0], 0, Wc - c.shape[1], cv2.BORDER_CONSTANT, value=255)
                 for c in cells]
        while len(cells) % ncol:
            cells.append(np.full((H, Wc), 255, np.uint8))
        sep = np.full((H, 40), 255, np.uint8)
        sep[:, 19:21] = 170
        rows = []
        for r in range(0, len(cells), ncol):
            row = cells[r]
            for c in cells[r + 1:r + ncol]:
                row = np.hstack([row, sep, c])
            rows.append(row)
        img = rows[0]
        for row in rows[1:]:
            hsep = np.full((40, row.shape[1]), 255, np.uint8)
            hsep[19:21, :] = 170
            img = np.vstack([img, hsep, row])
    img = cv2.copyMakeBorder(img, 20, 20, 10, 10, cv2.BORDER_CONSTANT, value=255)
    s = min(SCALE, (MAX_SIDE if ncell <= 2 else MAX_SIDE_BIG) / float(max(img.shape)))
    if s < 1.0:
        img = cv2.resize(img, (int(img.shape[1] * s), int(img.shape[0] * s)), interpolation=cv2.INTER_AREA)
    return img, ncell


def main():
    mode, full, detp, labp, out = sys.argv[1:6]
    det = json.load(open(detp))
    labels = json.load(open(labp, encoding='utf-8')) if labp != 'none' and os.path.exists(labp) else {}
    adds = ADDED_HEADINGS
    os.makedirs(out, exist_ok=True)
    if mode == 'sheets':
        heads = ordered_heads(det, adds)
        per = 30
        for s in range(0, len(heads), per):
            tiles = []
            for i, (sn, side, h) in enumerate(heads[s:s + per]):
                rot, pg = page_img(full, det, sn, side)
                x0 = max(0, min(h['x0'], pg['lx0'] + 150) - 10)
                x1 = min(rot.shape[1], x0 + 1000)
                crop = rot[max(0, h['top'] - 8):h['bottom'] + 8, x0:x1]
                crop = cv2.resize(crop, (int(crop.shape[1] * 0.5), int(crop.shape[0] * 0.5)), interpolation=cv2.INTER_AREA)
                tile = np.full((34, 640), 255, np.uint8)
                cv2.putText(tile, '%d' % (s + i), (4, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, 0, 2)
                lab = h.get('label') or labels.get(key(sn, side, h), '')
                cv2.putText(tile, '%d%s %s' % (sn, side, lab), (62, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.45, 90, 1)
                ch, cw = min(crop.shape[0], 34), min(crop.shape[1], 640 - 130)
                tile[:ch, 130:130 + cw] = crop[:ch, :cw]
                tiles.append(tile)
            while len(tiles) % 2:
                tiles.append(np.full((34, 640), 255, np.uint8))
            half = len(tiles) // 2
            col1 = np.vstack(tiles[:half])
            col2 = np.vstack(tiles[half:])
            sheet = np.hstack([col1, np.full((col1.shape[0], 12), 0, np.uint8), col2])
            cv2.imwrite(os.path.join(out, 'sheet_%03d.png' % (s // per)), sheet)
        with open(os.path.join(out, 'heads.json'), 'w') as f:
            json.dump([key(sn, side, h) for sn, side, h in heads], f, indent=0)
        print('headings', len(heads))
    else:
        frags, real, lab = fragments(det, labels, adds)
        # main tune -> <out>/<NUM>.jpg, second tune -> <out>/tune2/<NUM>.jpg
        want = set(sys.argv[6:])
        keys = sorted(k for k in frags if not want or k[0] in want)
        os.makedirs(os.path.join(out, 'tune2'), exist_ok=True)
        stats = {}
        for num, tune in keys:
            img, ncell = song_image(full, det, frags[(num, tune)], (num, tune) in TRIM_TAIL)
            stats[ncell] = stats.get(ncell, 0) + 1
            # cv2.imwrite cannot open non-ASCII paths on Windows ("084а.jpg")
            ok, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, QUALITY])
            sub = out if tune == 1 else os.path.join(out, 'tune2')
            with open(os.path.join(sub, '%s.jpg' % num), 'wb') as f:
                f.write(buf.tobytes())
        print('rendered', len(keys), 'cells:', stats)


if __name__ == '__main__':
    main()
