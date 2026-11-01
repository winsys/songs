# -*- coding: utf-8 -*-
"""Page layout analysis of the 1927 «Гусли» spreads: pages, deskew, staff bands, text lines."""
import cv2
import numpy as np


def binarize(gray):
    g = cv2.GaussianBlur(gray, (3, 3), 0)
    return (cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 41, 18) > 0).astype(np.uint8)


def hlines(ink, klen):
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (klen, 1))
    return cv2.morphologyEx(ink, cv2.MORPH_OPEN, k)


def staff_segments(ink, min_len):
    """Long horizontal line segments: [(x0, x1, y_center, slope)]."""
    op = hlines(ink, max(15, min_len // 6))
    op = cv2.morphologyEx(op, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (25, 1)))
    n, lab, st, cen = cv2.connectedComponentsWithStats(op, 8)
    segs = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if w < min_len or h > w * 0.08 + 12:
            continue
        ys, xs = np.nonzero(lab[y:y + h, x:x + w] == i)
        p = np.polyfit(xs + x, ys + y, 1)
        segs.append((int(x), int(x + w), float(np.polyval(p, x + w / 2.0)), float(p[0])))
    return segs


def rotate(img, angle_deg, center, border):
    M = cv2.getRotationMatrix2D(center, angle_deg, 1.0)
    return cv2.warpAffine(img, M, (img.shape[1], img.shape[0]), flags=cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=border)


def runs(mask):
    """[(start, end_inclusive)] of True runs in a 1-D bool array."""
    out = []
    start = None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i - 1))
            start = None
    if start is not None:
        out.append((start, len(mask) - 1))
    return out


def staff_bands(rot, x0, x1, spacing_hint=15):
    """Row bands holding staff lines on a deskewed page (tolerant to slight page curvature):
    lenient binarization, long horizontal opening, small closing, vertical dilation so the
    5 lines merge into one band; a band needs >= 35% width coverage and >= 45 px height."""
    g = cv2.GaussianBlur(rot, (3, 3), 0)
    ink = (cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 31, 8) > 0).astype(np.uint8)
    sub = ink[:, x0:x1]
    op = cv2.morphologyEx(sub, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (60, 1)))
    op = cv2.morphologyEx(op, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1)))
    d = cv2.dilate(op, np.ones((9, 1), np.uint8))
    prof = d.sum(axis=1) / float(x1 - x0)
    out = []
    for a, b in runs(prof > 0.35):
        if out and a - out[-1][1] <= 12:
            out[-1] = (out[-1][0], b)
        else:
            out.append((a, b))
    return [(int(a), int(b)) for a, b in out if b - a >= 45], prof
