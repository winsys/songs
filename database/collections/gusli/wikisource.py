# -*- coding: utf-8 -*-
"""Tiny MediaWiki API helper: python wikisource.py <title> [site]  -> prints resolved title + wikitext."""
import io, json, sys, time, urllib.parse, urllib.request

UA = 'SongsCollectionImport/1.0 (+https://github.com/winsys/songs)'


def api(params, site='ru.wikisource.org'):
    params = dict(params, format='json', formatversion='2')
    url = 'https://%s/w/api.php' % site
    body = urllib.parse.urlencode(params).encode('ascii')
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, data=body, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            time.sleep(2 * (attempt + 1))
            err = e
    raise err


def pages_content(titles, site='ru.wikisource.org'):
    """{requested_title: (resolved_title, wikitext or None)} for up to 50 titles."""
    d = api({'action': 'query', 'prop': 'revisions', 'rvprop': 'content', 'rvslots': 'main',
             'titles': '|'.join(titles), 'redirects': 1}, site)
    q = d.get('query', {})
    norm = {n['from']: n['to'] for n in q.get('normalized', [])}
    redir = {n['from']: n['to'] for n in q.get('redirects', [])}
    by_title = {}
    for p in q.get('pages', []):
        txt = None
        if 'revisions' in p:
            txt = p['revisions'][0]['slots']['main']['content']
        by_title[p['title']] = txt
    out = {}
    for t in titles:
        r = norm.get(t, t)
        seen = 0
        while r in redir and seen < 5:
            r = redir[r]
            seen += 1
        out[t] = (r, by_title.get(r))
    return out


if __name__ == '__main__':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    site = sys.argv[2] if len(sys.argv) > 2 else 'ru.wikisource.org'
    res = pages_content([sys.argv[1]], site)
    for k, (r, t) in res.items():
        print('==', k, '->', r)
        print(t)
