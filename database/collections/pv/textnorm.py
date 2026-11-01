# -*- coding: utf-8 -*-
"""Shared text normalisation for matching song titles / first lines."""
import difflib, re


def norm(s):
    s = s.lower().replace('ё', 'е')
    s = re.sub(r'[^0-9a-zа-я]+', ' ', s)
    return ' '.join(s.split())


def same_title(a, b, ratio=0.82):
    """Titles of the same song: equal, one a word-prefix of the other (>= 3 words), or close."""
    a, b = norm(a), norm(b)
    if not a or not b:
        return False
    if a == b:
        return True
    wa, wb = a.split(), b.split()
    k = min(len(wa), len(wb))
    if k >= 3 and wa[:k] == wb[:k]:
        return True
    return difflib.SequenceMatcher(None, a, b).ratio() >= ratio
