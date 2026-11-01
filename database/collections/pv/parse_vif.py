# -*- coding: utf-8 -*-
"""python -I parse_vif.py <pages_dir> <out.json> -> [{num, title, stanzas: [{label, n, lines}]}]
from the vifania.org.ua «Песнь возрождения» list pages; prints label statistics."""
import collections, html, io, json, os, re, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
src, out = sys.argv[1], sys.argv[2]
ENTRY = re.compile(r'<a\s+href="https://vifania\.org\.ua/SongOfRevival/(\d+)\.html">\s*(\d+)\s+(.*?)</a>'
                   r'.*?<details>\s*<summary>.*?</summary>(.*?)</details>', re.S)
songs = {}
labels = collections.Counter()
odd = []
for f in sorted(os.listdir(src)):
    s = open(os.path.join(src, f), encoding='utf-8').read()
    for m in ENTRY.finditer(s):
        num, num2, title, body = int(m.group(1)), int(m.group(2)), m.group(3), m.group(4)
        if num != num2:
            odd.append(('num mismatch', num, num2))
        title = html.unescape(re.sub(r'\s+', ' ', title)).strip()
        body = body.replace('\r', '').replace('\n', '')
        stanzas = []
        for chunk in re.split(r'(?:<br\s*/?>\s*){2,}', body):
            chunk = chunk.strip()
            if not chunk:
                continue
            lm = re.match(r'^(?:<br\s*/?>\s*)*<strong>(.*?)</strong>\s*([0-9]*)\s*\.?\s*:?\s*(.*)$', chunk, re.S)
            if lm:
                label, n, rest = html.unescape(lm.group(1)).strip(), lm.group(2), lm.group(3)
            else:
                label, n, rest = '', '', chunk
            lines = [html.unescape(re.sub(r'<[^>]+>', '', l)).strip() for l in re.split(r'<br\s*/?>', rest)]
            lines = [re.sub(r'\s+', ' ', l) for l in lines if l.strip()]
            labels[label] += 1
            stanzas.append({'label': label, 'n': n, 'lines': lines})
        if num in songs:
            odd.append(('duplicate', num))
        songs[num] = {'num': num, 'title': title, 'stanzas': stanzas}
res = [songs[k] for k in sorted(songs)]
json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('songs', len(res), 'range', res[0]['num'] if res else None, '..', res[-1]['num'] if res else None)
print('labels', labels.most_common(25))
print('odd', odd[:20])
missing = [n for n in range(1, (res[-1]['num'] if res else 0) + 1) if n not in songs]
print('missing numbers', len(missing), missing[:80])
empty = [s['num'] for s in res if not s['stanzas']]
print('without text', len(empty), empty[:30])
