# -*- coding: utf-8 -*-
"""Song order from the 13 section pages: [(num, section, target_title, display)]."""
import re

ED = 'Гусли (сборник)/Третье издание (ДО)'
SECTIONS = ['Любовь Божия и Его величие', 'Призыв к вере и новой жизни', 'Моления и прошения',
            'Хвала и благодарение', 'Первые шаги веры', 'Чувства веры',
            'Мир Божий и христианская радость', 'Путь веры', 'Плоды и подвиги веры',
            'Чаяния  веры', 'Песни на разные случаи христианской жизни', 'Детские песни',
            'Разные песнопения']


def song_order(pages):
    out = []
    n = 0
    for s in SECTIONS:
        txt = pages['%s/%s' % (ED, s)]
        for line in txt.split('\n'):
            m = re.match(r'^#\s*(.*)$', line)
            m2 = re.match(r'^\s*(\d+)\s*\.\s*(.*)$', line)
            if m2:
                num, item = int(m2.group(1)), m2.group(2)
                n = num
            elif m and not line.startswith('#перенаправление'):
                item = m.group(1)
                n += 1
            else:
                continue
            lm = re.search(r'\[\[([^|\]]+)(?:\|([^\]]*))?\]\]', item)
            if lm:
                out.append((n, s, lm.group(1).strip(), (lm.group(2) or lm.group(1)).strip()))
            else:
                out.append((n, s, None, item.strip()))
    return out
