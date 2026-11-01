# -*- coding: utf-8 -*-
"""Download the «Гусли» texts (3rd edition, 1911) from ru.wikisource.org.

  python fetch_texts.py <work_dir>        -> <work_dir>/songs_raw.json

The song order comes from the 13 section pages of «Гусли (сборник)/Третье
издание (ДО)» (numbers 1..507; number 84 is printed twice — «84 а» / «84 б»
since the 1927 edition). For every song the base page is resolved (redirects)
and its subpages «/Гусли 1911 года (ДО)» (pre-reform spelling, every song) and
«/Гусли 1911 года (ВТ)» (an editor's modern-spelling copy, ~180 songs) are
stored; №507 «Аминь» has its text on the base page itself.
"""
import io, json, os, sys
from sections import SECTIONS, ED, song_order
from wikisource import pages_content

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
work = sys.argv[1]
os.makedirs(work, exist_ok=True)

sec_titles = ['%s/%s' % (ED, s) for s in SECTIONS]
pages = {t: txt for t, (r, txt) in pages_content(sec_titles).items()}
order = song_order(pages)
print('songs in the section lists:', len(order))

bases = [r[2] for r in order]
resolved = {}
for i in range(0, len(bases), 50):
    resolved.update(pages_content(bases[i:i + 50]))

subs = []
for b in bases:
    r = resolved[b][0]
    subs += [r + '/Гусли 1911 года (ДО)', r + '/Гусли 1911 года (ВТ)']
subtxt = {}
for i in range(0, len(subs), 50):
    for k, (r, t) in pages_content(subs[i:i + 50]).items():
        subtxt[k] = t

out = []
for num, sec, target, disp in order:
    r, base_txt = resolved[target]
    rec = {'num': num, 'section': sec, 'target': target, 'resolved': r, 'display_do': disp,
           'base': base_txt, 'do': subtxt.get(r + '/Гусли 1911 года (ДО)'),
           'vt': subtxt.get(r + '/Гусли 1911 года (ВТ)')}
    if not rec['do'] and not rec['vt']:
        print('no 1911 subpage (text taken from the base page):', num, r)
    out.append(rec)
with io.open(os.path.join(work, 'songs_raw.json'), 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=0)
print('songs', len(out), 'with ДО', sum(1 for x in out if x['do']), 'with ВТ', sum(1 for x in out if x['vt']))
