# -*- coding: utf-8 -*-
"""python -I parse_hvs.py <song_pages_dir> <out.json> -> [{num, title, key, stanzas:[{label, n, lines}]}]
from hvalite.com song pages (<pre id="music_text">, «Куплет N:» / «Припев:» blocks)."""
import collections, html, io, json, os, re, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
src, out = sys.argv[1], sys.argv[2]
res = []
labels = collections.Counter()
for f in sorted(os.listdir(src), key=lambda x: int(x.split('.')[0])):
    s = open(os.path.join(src, f), encoding='utf-8').read()
    num = int(f.split('.')[0])
    title = html.unescape(re.search(r'<h1>(.*?)</h1>', s, re.S).group(1)).strip()
    key = re.search(r'<th>Тональность</th><td>(.*?)</td>', s)
    pre = re.search(r'<pre id="music_text"[^>]*>(.*?)</pre>', s, re.S)
    text = html.unescape(re.sub(r'<[^>]+>', '', pre.group(1))) if pre else ''
    stanzas = []
    for block in re.split(r'\n\s*\n', text.replace('\r', '')):
        lines = [l.strip() for l in block.split('\n') if l.strip()]
        if not lines:
            continue
        m = re.match(r'^(Куплет|Припев|Хор|Окончание|Концовка|Бридж|Мост|Вставка)\s*(\d*)\s*:?\s*$', lines[0], re.I)
        if m:
            label, n, lines = m.group(1).capitalize(), m.group(2), lines[1:]
        else:
            label, n = '', ''
        labels[label] += 1
        stanzas.append({'label': label, 'n': n, 'lines': lines})
    res.append({'num': num, 'title': title, 'key': key.group(1).strip() if key else '', 'stanzas': stanzas})
json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('songs', len(res), 'labels', labels.most_common())
for r in res:
    if r['num'] in (1312, 1313, 1314, 1315):
        print(r['num'], r['title'], '|', r['stanzas'][0]['lines'][:2] if r['stanzas'] else None)
