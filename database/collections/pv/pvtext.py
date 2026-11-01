# -*- coding: utf-8 -*-
"""Stanzas -> song TEXT in the house style of the Russian collections: one line per stanza,
"N. …" for a verse, "* …" for a chorus (import help: a chorus starts with «*»)."""
import re

# label written as a text line (vifania №854, hvalite slips like «Куплет 1:0», «Припев: 1 - Куплет 2:»)
LABEL_LINE = re.compile(r'^(?:Припев\s*:?\s*\d*\s*-\s*)?(Куплет|Припев)\s*(\d*)\s*:?\s*\d*\s*$')


def clean(s):
    s = s.replace(' ', ' ').replace('​', '')
    return ' '.join(s.split())


ONE_LETTER_WORDS = set('ивскоуая')


def rejoin(lines):
    """vifania slip: a word's capital stays at the end of the previous line («мои, О» / «ткуда …»)."""
    out = list(lines)
    for i in range(len(out) - 1):
        m = re.search(r'(^|\s)([А-ЯЁа-яё])$', out[i])
        if m and re.match(r'^[а-яё]', out[i + 1]) and (m.group(2).isupper() or m.group(2) not in ONE_LETTER_WORDS):
            out[i] = out[i][:m.start(2)].rstrip()
            out[i + 1] = m.group(2) + out[i + 1]
    return [l for l in out if l]


def normalize(stanzas):
    out = []
    for st in stanzas:
        label, n, lines = st['label'], st['n'], rejoin([clean(l) for l in st['lines'] if clean(l)])
        if not label and lines:
            m = LABEL_LINE.match(lines[0])
            if m:
                label, n, lines = m.group(1), m.group(2), lines[1:]
        if lines:
            out.append({'label': label, 'n': n, 'lines': lines})
    return out


def to_text(stanzas):
    rows = []
    for st in normalize(stanzas):
        body = ' '.join(st['lines'])
        if st['label'] == 'Куплет':
            rows.append(('%s. ' % st['n'] if st['n'] else '') + body)
        elif st['label'] == 'Припев':
            rows.append('* ' + body)
        else:
            rows.append(body)
    return '\r\n'.join(rows)


def name_of(stanzas, fallback):
    st = normalize(stanzas)
    first = st[0]['lines'][0] if st else fallback
    first = re.sub(r'^[\s:,]+', '', first)                       # repeat sign «:,: …»
    first = re.sub(r'\s*:,:\s*', ' ', first)
    return re.sub(r'[\s,.;:!?…—–-]+$', '', first).strip() or fallback
