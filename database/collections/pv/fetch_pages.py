# -*- coding: utf-8 -*-
"""python -I fetch_pages.py <out_dir> <url_template with {n}> <first> <last> [delay]
Polite sequential download (skips files already there, retries with backoff)."""
import io, os, sys, time, urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
UA = 'SongsCollectionImport/1.0 (+https://github.com/winsys/songs)'
out, tpl, first, last = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
delay = float(sys.argv[5]) if len(sys.argv) > 5 else 0.6
os.makedirs(out, exist_ok=True)
for n in range(first, last + 1):
    dst = os.path.join(out, 'p%04d.html' % n)
    if os.path.exists(dst) and os.path.getsize(dst) > 1000:
        continue
    for attempt in range(5):
        try:
            req = urllib.request.Request(tpl.format(n=n), headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
            open(dst, 'wb').write(body)
            break
        except Exception as e:
            print('page', n, 'attempt', attempt, e, flush=True)
            time.sleep(5 * (2 ** attempt))
    if n % 25 == 0:
        print('done', n, flush=True)
    time.sleep(delay)
print('finished', first, last, flush=True)
