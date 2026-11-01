# -*- coding: utf-8 -*-
"""Parse a Wikisource song page (wikitext) into stanza blocks."""
import html, re

TYPO = re.compile(r'^(опечатка|опечатка2|опечатка 2)$', re.I)


def strip_header(txt):
    """Drop the leading {{Отексте ...}} template (brace matching)."""
    i = txt.find('{{Отексте')
    if i < 0:
        return txt
    depth = 0
    j = i
    while j < len(txt):
        if txt.startswith('{{', j):
            depth += 1
            j += 2
            continue
        if txt.startswith('}}', j):
            depth -= 1
            j += 2
            if depth == 0:
                return txt[j:]
            continue
        j += 1
    return txt


def expand(name, args, warn):
    n = name.strip()
    nl = n.lower()
    if TYPO.match(nl):
        return args[1] if len(args) > 1 else (args[0] if args else '')
    if n == '№':
        x = args[0].strip() if args else ''
        if re.search(r'[^\W\d_]', x):
            return '\n@@LABEL@@' + x + '\n'
        return '@@VNUM@@'
    if nl in ('razr', 'razr2', 'разрядка'):
        return args[0] if args else ''
    if n == 'Отступ':
        return args[1] if len(args) > 1 else ''
    if nl == 'comment':
        return args[0] if args else ''
    if nl in ('подст:ударение', 'ударение'):
        return ''
    if n in ('Поле справа', 'межбуквенный интервал', 'межбуквенный  интервал', 'ПримВТ', 'примечания'):
        return ' ' if n.startswith('меж') else ''
    if n in ('Right-span', 'Right', 'Библия', 'Шаблон:Библия', 'BASEPAGENAME'):
        return ''
    warn.append('template ' + n)
    return ''


def split_args(inner):
    # inner has no nested templates by construction (innermost-first)
    parts = inner.split('|')
    return parts[0], [p for p in parts[1:]]


def poem_text(txt, warn):
    body = strip_header(txt)
    polys = re.findall(r'<poem>(.*?)</poem>', body, flags=re.S)
    if not polys:
        warn.append('no poem')
        return ''
    s = '\n\n'.join(polys)
    s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
    s = re.sub(r'<ref[^>/]*/>', '', s)
    s = re.sub(r'<ref[^>]*>.*?</ref>', '', s, flags=re.S)
    s = re.sub(r'<small>.*?</small>', '', s, flags=re.S)
    # innermost-first template expansion
    for _ in range(10):
        new = re.sub(r'\{\{([^{}]*)\}\}', lambda m: expand(*split_args(m.group(1)), warn=warn), s)
        if new == s:
            break
        s = new
    s = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', s)
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'</?(div|p)\b[^>]*>', '\n\n', s)   # stanza-level blocks (indented stanzas)
    s = re.sub(r'</?(big|span|sup|sub|center|u|i|b|s)\b[^>]*>', '', s)
    s = s.replace("'''", '').replace("''", '')
    s = html.unescape(s)
    s = s.replace(' ', ' ').replace('\xa0', ' ').replace('​', '')
    if re.search(r'<[a-zA-Z/]', s):
        warn.append('tag left: ' + re.search(r'<[^>]*>', s).group(0))
    return s


CHORUS = re.compile(r'^\[?\s*(Припѣвъ|Припев|Хоръ|Хор)\b', re.I)


def blocks(s):
    """[(kind, label, [lines])] ; kind = 'v' verse | 'c' chorus."""
    out = []
    for raw in re.split(r'\n\s*\n', s):
        lines = [' '.join(l.split()) for l in raw.split('\n')]
        lines = [l for l in lines if l and l != '@@VNUM@@']
        lines = [l.replace('@@VNUM@@', '').strip() for l in lines]
        lines = [l for l in lines if l]
        if not lines:
            continue
        # a block may carry several labelled parts (verse, then "Припѣвъ:" + chorus lines)
        cur_kind, cur_label, cur = 'v', '', []
        for l in lines:
            lab = None
            if l.startswith('@@LABEL@@'):
                lab = l[len('@@LABEL@@'):].strip()
            elif CHORUS.match(l) and (l.rstrip().endswith(':') or l.rstrip().endswith(']')
                                       or len(l) < 40 and ':' in l):
                lab = l
            if lab is not None:
                if cur:
                    out.append((cur_kind, cur_label, cur))
                cur_kind, cur_label, cur = 'c', lab, []
                # label line may carry the first chorus line after the colon
                continue
            cur.append(l)
        if cur:
            out.append((cur_kind, cur_label, cur))
        elif cur_kind == 'c':
            out.append((cur_kind, cur_label, []))
    return out
