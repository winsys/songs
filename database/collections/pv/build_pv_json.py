# -*- coding: utf-8 -*-
"""python build_pv_json.py <pv_raw.json> <notes_dir> <out.json> -> apply_collection.php data file of
«Песнь Возрождения» (3055): NUM = the printed number, plain digits; groups for the tunes present."""
import io, json, os, sys
from pvtext import to_text, name_of

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
raw = json.load(open(sys.argv[1], encoding='utf-8'))
notes = sys.argv[2]
songs = []
for s in raw:
    text = to_text(s['stanzas'])
    if not text:
        print('no text', s['num'])
        continue
    src = 'vifania.org.ua' if s['src'] == 'vifania' else 'hvalite.com (3300 ed., same number)'
    songs.append({'num': str(s['num']), 'name': name_of(s['stanzas'], s['title']), 'texts': {'ru': text},
                  'source': src})
GROUPS = [
    ('НОТЫ', '', True, {'ru': 'НОТЫ', 'de': 'NOTEN', 'en': 'SHEET MUSIC', 'lt': 'NATOS', 'pl': 'NUTY'}),
    ('2-Й НАПЕВ', 'tune2', False, {'ru': '2-Й НАПЕВ', 'de': '2. MELODIE', 'en': '2ND TUNE',
                                   'lt': '2-OJI MELODIJA', 'pl': '2. MELODIA'}),
    ('3-Й НАПЕВ', 'tune3', False, {'ru': '3-Й НАПЕВ', 'de': '3. MELODIE', 'en': '3RD TUNE',
                                   'lt': '3-IOJI MELODIJA', 'pl': '3. MELODIA'}),
    ('4-Й НАПЕВ', 'tune4', False, {'ru': '4-Й НАПЕВ', 'de': '4. MELODIE', 'en': '4TH TUNE',
                                   'lt': '4-OJI MELODIJA', 'pl': '4. MELODIA'}),
]
groups = []
for name, d, main, names in GROUPS:
    n = len([f for f in os.listdir(os.path.join(notes, d)) if f.endswith('.jpg')]) if os.path.isdir(os.path.join(notes, d)) else 0
    if main or n:
        groups.append({'name': name, 'main': main, 'dir': d, 'names': names})
    print('group', name, n, 'images')
data = {
    'list_name': 'Песнь Возрождения',
    'source': '«Песнь Возрождения», издание на 3055 песен: тексты — vifania.org.ua (ошибки нумерации сайта '
              'исправлены, №800–849, 1314, 1423, 1716, 1781 — hvalite.com, там те же номера; №3036 нет ни в одном '
              'источнике); ноты — «Песни христиан, том 1 (Песнь Возрождения)», МСЦ ЕХБ, 2002 '
              '(mscmusic.org), сопоставлены по началу первого куплета, номер на листе заменён номером сборника',
    'grant_groups': [1],
    'image_groups': groups,
    'songs': songs,
}
with io.open(sys.argv[3], 'w', encoding='utf-8', newline='\n') as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
    f.write('\n')
print('songs', len(songs))
