# -*- coding: utf-8 -*-
"""python -I fetch_hv_songs.py <hvl.json> <out_dir> <num|from-to> [...] -> hvalite song pages as <out>/<num>.html"""
import io, json, os, sys, time, urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
UA = 'SongsCollectionImport/1.0 (+https://github.com/winsys/songs)'
hvl = {s['num']: s for s in json.load(open(sys.argv[1], encoding='utf-8'))}
out = sys.argv[2]
os.makedirs(out, exist_ok=True)
nums = []
for a in sys.argv[3:]:
    if '-' in a:
        x, y = a.split('-')
        nums += range(int(x), int(y) + 1)
    else:
        nums.append(int(a))
for n in nums:
    dst = os.path.join(out, '%d.html' % n)
    if os.path.exists(dst):
        continue
    req = urllib.request.Request('https://hvalite.com' + hvl[n]['href'], headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        open(dst, 'wb').write(r.read())
    time.sleep(1.0)
print('fetched', len(nums))
