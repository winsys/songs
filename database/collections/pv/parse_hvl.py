# -*- coding: utf-8 -*-
"""python -I parse_hvl.py <pages_dir> <out.json> -> [{num, title, href}] from hvalite.com /pesni list pages."""
import html, io, json, os, re, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
src, out = sys.argv[1], sys.argv[2]
ITEM = re.compile(r'<h6[^>]*><a href="(/pesni/[^"]+)">(.*?)</a></h6>\s*<small[^>]*>Песнь возрождения №(\d+)</small>', re.S)
res = {}
for f in sorted(os.listdir(src)):
    s = open(os.path.join(src, f), encoding='utf-8').read()
    for m in ITEM.finditer(s):
        n = int(m.group(3))
        res[n] = {'num': n, 'title': html.unescape(m.group(2)).strip(), 'href': m.group(1)}
lst = [res[k] for k in sorted(res)]
json.dump(lst, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('items', len(lst), 'range', lst[0]['num'], '..', lst[-1]['num'],
      'missing', [n for n in range(1, lst[-1]['num'] + 1) if n not in res][:20])
