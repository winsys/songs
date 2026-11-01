# -*- coding: utf-8 -*-
"""Fetch all works of the given mscmusic.org collections (by prefix or id) into <out>/msc_<c>.json.
python msc_fetch.py <out_dir> <collection> [...]"""
import io, json, os, sys, time, urllib.parse, urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
UA = 'SongsCollectionImport/1.0 (+https://github.com/winsys/songs)'
out = sys.argv[1]
for col in sys.argv[2:]:
    items, page = [], 0
    while True:
        url = 'https://mscmusic.org/api/works?' + urllib.parse.urlencode(
            {'pageNum': page, 'pageSize': 200, 'collection': col})
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            d = json.loads(r.read().decode('utf-8'))
        items += d['content']
        if d.get('last') or not d['content']:
            break
        page += 1
        time.sleep(0.5)
    json.dump(items, open(os.path.join(out, 'msc_%s.json' % col), 'w', encoding='utf-8'), ensure_ascii=False)
    print(col, len(items))
    time.sleep(0.5)
