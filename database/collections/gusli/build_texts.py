# -*- coding: utf-8 -*-
"""songs_raw.json -> gusli.json (apply_collection.php format).
python build_texts.py <songs_raw.json> <out.json>"""
import html, io, json, re, sys
from collections import Counter
from parse_ws import poem_text, blocks, strip_header
from ortho import modernize

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
raw = json.load(io.open(sys.argv[1], encoding='utf-8'))

# Transcription typos of the Wikisource copy (checked in context), word -> fix.
FIXES = {
    'незабудьте': 'не забудьте', 'сьет': 'свет', 'неумолкни': 'не умолкни', 'Тоть': 'Тот',
    'жалабу': 'жалобу', 'восшсл': 'восшел', 'Занечатлен': 'Запечатлен', 'ОСпаситель': 'О Спаситель',
    'Чтож': 'Что ж', 'чтож': 'что ж', 'Милльоны': 'Мильоны', 'мученников': 'мучеников',
    'произростала': 'произрастала', 'порозит': 'поразит', 'обножите': 'обнажите',
    'безразсудно': 'безрассудно', 'дышет': 'дышит',
}
LAT2CYR = {'A': 'А', 'B': 'В', 'C': 'С', 'E': 'Е', 'H': 'Н', 'K': 'К', 'M': 'М', 'O': 'О',
           'P': 'Р', 'T': 'Т', 'X': 'Х', 'a': 'а', 'c': 'с', 'e': 'е', 'o': 'о', 'p': 'р',
           'x': 'х', 'y': 'у'}


def fix_words(t):
    def homo(m):
        w = m.group(0)
        if re.search('[А-Яа-яЁё]', w) and re.search('[A-Za-z]', w):
            w = ''.join(LAT2CYR.get(ch, ch) for ch in w)
        return FIXES.get(w, w)
    return re.sub(r'[A-Za-zА-Яа-яЁё]+', homo, t)


seen84 = 0
songs = []
warn = []
unknown = []
for r in raw:
    n = r['num']
    if n == 84:
        num = '084' + ('а' if seen84 == 0 else 'б')
        seen84 += 1
    else:
        num = '%03d' % n
    if r['do']:
        src, kind = r['do'], 'ДО'
    elif r['vt']:
        src, kind = r['vt'], 'ВТ'
    else:
        src, kind = r['base'], 'base'
    w = []
    text = poem_text(src, w)
    if kind == 'ДО':
        text = modernize(text, unknown)
    text = fix_words(text)
    warn += ['%s: %s' % (num, x) for x in w]
    out_lines = []
    vno = 0
    pending = None
    for k, label, lines in blocks(text):
        body = ' '.join(lines).strip()
        body = re.sub(r'\s+([,.;!?»]|:(?!,))', r'\1', body)   # keeps the ":,:" repeat sign apart
        body = re.sub(r'«\s+', '«', body)
        if k == 'v' and pending:
            # the label stood alone in its block: this block is the chorus
            k, label, pending = 'c', pending, None
        if k == 'c':
            lab = modernize(label)
            lab = lab.strip()
            lab = re.sub(r'^\[(.*)\]$', r'\1', lab).strip()
            if not lab.endswith(':'):
                lab = lab.rstrip('.') + ':'
            # a label line that already carries the first chorus words ("Припев: Чтоб все...")
            m = re.match(r'^((?:Припев|Хор)[^:]*:)\s*(.+)$', lab)
            if m:
                lab, first = m.group(1), m.group(2).rstrip(':')
                body = (first + ' ' + body).strip()
            # normalize the label: "Припев, к 1, 2 и 3 стихам:" / "Припев в конце:" -> "Припев:"
            lab = 'Хор:' if lab.startswith('Хор') else 'Припев:'
            if not body:
                pending = lab
                continue
            out_lines.append('%s %s' % (lab, body))
        else:
            if not body:
                continue
            vno += 1
            out_lines.append('%d. %s' % (vno, body))
    if not out_lines:
        warn.append('%s: NO TEXT' % num)
        continue
    # title: the Wikisource page name (modern spelling), minus disambiguation brackets
    title = re.sub(r'\s*\([^)]*\)\s*$', '', html.unescape(r['target'])).replace('\xa0', ' ').strip()
    title = fix_words(title)
    title = title.rstrip('…').rstrip('.').strip()
    songs.append({'num': num, 'name': title, 'texts': {'ru': '\r\n'.join(out_lines)},
                  'source': 'ru.wikisource: %s/Гусли 1911 года (%s)' % (r['resolved'], kind)
                  if kind != 'base' else 'ru.wikisource: %s' % r['resolved']})

data = {
    'list_name': 'Гусли',
    'source': 'И. С. Проханов, «Гусли». Сборник духовных песен. 3-е изд., 1911 (тексты: ru.wikisource.org, '
              'орфография приведена к современной); ноты: «Гусли: Сборник духовных песен с нотами», '
              'Л.: ВСЕХ, 1927 — British Library EAP1511/1/2/1/29, CC BY-NC 4.0',
    'grant_groups': [1],
    # sheet music: the (first) tune in «НОТЫ»; 44 songs printed with a second tune
    # («4 б», appendix «68 б» …) have it in «2-Й НАПЕВ»
    'image_groups': [
        {'name': 'НОТЫ', 'main': True, 'dir': '',
         'names': {'ru': 'НОТЫ', 'de': 'NOTEN', 'en': 'SHEET MUSIC', 'lt': 'NATOS', 'pl': 'NUTY'}},
        {'name': '2-Й НАПЕВ', 'dir': 'tune2',
         'names': {'ru': '2-Й НАПЕВ', 'de': '2. MELODIE', 'en': '2ND TUNE', 'lt': '2-OJI MELODIJA',
                   'pl': '2. MELODIA'}},
    ],
    'songs': songs,
}
with io.open(sys.argv[2], 'w', encoding='utf-8', newline='\n') as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
    f.write('\n')
print('songs', len(songs))
print('warnings', warn)
print('unknown words (not in lexicon, after conversion):', len(unknown))
c = Counter(unknown)
print(c.most_common(80))
