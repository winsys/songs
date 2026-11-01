# -*- coding: utf-8 -*-
"""Full-resolution grayscale spreads of BL EAP1511/1/2/1/29 via IIIF region requests (the server caps output at 1200 px).
python fetch_scans.py <out_dir> [first] [last]"""
import io, json, os, sys, time, urllib.request
from PIL import Image

out = sys.argv[1]
first = int(sys.argv[2]) if len(sys.argv) > 2 else 1
last = int(sys.argv[3]) if len(sys.argv) > 3 else 287
os.makedirs(out, exist_ok=True)
UA = 'SongsCollectionImport/1.0 (+https://github.com/winsys/songs)'
BASE = 'https://images.eap.bl.uk/EAP1511/EAP1511_1_2_1_29/%d.jp2'
T = 1200


def get(url):
    for attempt in range(12):
        try:
            time.sleep(0.6)   # stay polite: one request at a time with a pause
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except Exception as e:
            print('retry', url, e, flush=True)
            time.sleep(60 if '405' in str(e) or '429' in str(e) else 5 * (attempt + 1))
    raise RuntimeError('failed ' + url)


for n in range(first, last + 1):
    dst = os.path.join(out, '%03d.png' % n)
    if os.path.exists(dst):
        continue
    info = json.loads(get(BASE % n + '/info.json'))
    W, H = info['width'], info['height']
    canvas = Image.new('L', (W, H), 255)
    for y in range(0, H, T):
        for x in range(0, W, T):
            w, h = min(T, W - x), min(T, H - y)
            data = get(BASE % n + '/%d,%d,%d,%d/%d,/0/gray.jpg' % (x, y, w, h, w))
            tile = Image.open(io.BytesIO(data)).convert('L')
            if tile.size != (w, h):
                tile = tile.resize((w, h))
            canvas.paste(tile, (x, y))
    canvas.save(dst + '.part.png')
    os.replace(dst + '.part.png', dst)
    if n % 10 == 0:
        print('done', n, flush=True)
print('finished', flush=True)
