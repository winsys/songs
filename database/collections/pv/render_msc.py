# -*- coding: utf-8 -*-
"""Render one MSC «Песни христиан т.1» song PDF into one JPEG of sheet music:
pages cropped to the music (section title above the song and the page footer dropped),
stacked vertically; the printed MSC number (+ variant letter) replaced by NEWNUM.

python -I render_msc.py <song.pdf> <out.jpg> <newnum|-> [dpi]
As a module: render(pdf_path, out_path, newnum, dpi) -> (width, height, info)."""
import io, os, re, sys
import numpy as np
import pymupdf
from PIL import Image, ImageDraw, ImageFont

FONT = 'C:/Windows/Fonts/times.ttf'
# most title fonts of the book encode '0'..'9' as 0x14..0x1d, «RomanZag» as plain ASCII
DIGITS = re.compile(r'^([\x14-\x1d]+|[0-9]+)')
QUALITY = 75


def title_span(page, msc_num):
    """The span of the song title (starts with the printed number): (span, number_rect)."""
    d = page.get_text('rawdict')
    for b in d['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                chars = s['chars']
                j = 0                                   # a few titles start with a space
                while j < len(chars) and chars[j]['c'] in ('\x04', ' '):
                    j += 1
                txt = ''.join(c['c'] for c in chars[j:])
                m = DIGITS.match(txt)
                if not m or s['size'] < 11:
                    continue
                if int(''.join(chr(ord(c) + 0x1c) if c < ' ' else c for c in m.group(1))) != msc_num:
                    continue
                # number + variant letter = everything before the next space (0x04)
                k = j
                while k < len(chars) and chars[k]['c'] not in ('\x04', ' '):
                    k += 1
                r = pymupdf.Rect(chars[j]['bbox'])
                for c in chars[j + 1:k]:
                    r |= pymupdf.Rect(c['bbox'])
                # limit for whiting out: the end of the space after the number
                return s, r, chars[k]['bbox'][2] if k < len(chars) else r.x1 + s['size'] * 0.3
    return None, None, None


def bands(gray, thr=200):
    """Row bands of ink: [(y0, y1)] separated by blank rows."""
    ink = (gray < thr).sum(axis=1) > 0
    out, y = [], None
    for i, v in enumerate(ink):
        if v and y is None:
            y = i
        elif not v and y is not None:
            out.append((y, i))
            y = None
    if y is not None:
        out.append((y, len(ink)))
    return out


def crop_page(gray, top_px=None):
    """Crop to the ink; drop a footer band (last band, near the page bottom, after a big gap)."""
    h = gray.shape[0]
    bs = bands(gray)
    if top_px is not None:
        bs = [b for b in bs if b[1] > top_px]
        if bs:
            bs[0] = (max(bs[0][0], top_px), bs[0][1])
    if len(bs) >= 2:
        y0, y1 = bs[-1]
        gap = y0 - bs[-2][1]
        if y0 > 0.84 * h and (y1 - y0) < 0.03 * h and gap > 0.02 * h:
            bs = bs[:-1]
    if not bs:
        return None
    y0, y1 = bs[0][0], bs[-1][1]
    cols = np.where((gray[y0:y1] < 200).sum(axis=0) > 0)[0]
    x0, x1 = cols[0], cols[-1] + 1
    return (int(x0), int(y0), int(x1), int(y1))


def render(pdf, out, newnum, dpi=200):
    doc = pymupdf.open(pdf)
    m = re.match(r'^(\d+)', os.path.basename(pdf))
    msc_num = int(m.group(1))
    zoom = dpi / 72.0
    parts = []
    info = {}
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
        gray = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width).copy()
        img = Image.fromarray(gray)
        top = None
        if i == 0:
            s, r, title_x = title_span(page, msc_num)
            if s is None:
                info['title'] = 'not found'
            else:
                top = int((s['bbox'][1] - 4) * zoom)
                if newnum:
                    # white out the printed number (its glyphs reach above the span box),
                    # write ours right-aligned to it
                    size = s['size']
                    rr = (int(r.x0 * zoom) - 3, int((s['bbox'][1] - 0.9 * size) * zoom),
                          int(min(r.x1 + 2, title_x) * zoom), int((s['bbox'][3] + 0.25 * size) * zoom))
                    dr = ImageDraw.Draw(img)
                    dr.rectangle(rr, fill=255)
                    fpx = s['size'] * zoom
                    font = ImageFont.truetype(FONT, int(round(fpx)))
                    w = dr.textlength(newnum, font=font)
                    asc, desc = font.getmetrics()
                    base = s['origin'][1] * zoom if 'origin' in s else rr[3] - desc
                    right = r.x1 * zoom
                    dr.text((right - w, base - asc), newnum, font=font, fill=0)
                    info['num_rect'] = rr
                gray = np.array(img)
        box = crop_page(gray, top)
        if box is None:
            continue
        parts.append(gray[box[1]:box[3], box[0]:box[2]])
    if not parts:
        raise RuntimeError('empty ' + pdf)
    # stack: common left edge = each part's own crop; pad to the widest
    gap = int(0.25 * dpi)
    W = max(p.shape[1] for p in parts) + 2 * int(0.12 * dpi)
    H = sum(p.shape[0] for p in parts) + gap * (len(parts) - 1) + 2 * int(0.12 * dpi)
    canvas = np.full((H, W), 255, np.uint8)
    y = int(0.12 * dpi)
    for p in parts:
        x = int(0.12 * dpi)
        canvas[y:y + p.shape[0], x:x + p.shape[1]] = p
        y += p.shape[0] + gap
    Image.fromarray(canvas).save(out, 'JPEG', quality=QUALITY, optimize=True)
    info['pages'] = doc.page_count
    return W, H, info


if __name__ == '__main__':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    pdf, out, newnum = sys.argv[1], sys.argv[2], sys.argv[3]
    dpi = int(sys.argv[4]) if len(sys.argv) > 4 else 200
    print(render(pdf, out, None if newnum == '-' else newnum, dpi))
