# -*- coding: utf-8 -*-
"""
Convert the "Only Believe" Lithuanian songbook module export
(only_believe_module.json, git-ignored — the app-module format of the
Kaunas group's song app, module id 30) into tiktai_tikek.json, the
tracked data file applied by apply_tiktai_tikek.php.

Module format, per song key "1".."137" (plus "__moduleMetaInfo"):
  { "number": 1, "key": [], "writer_text": "", "writer_music": "",
    "suffix": "", "i18n": { "<lt|en>": { "title": "...", "audiourl": "",
    "verses": ["line\nline\n...", ...] } } }

Every song carries exactly ONE i18n entry and ALL texts are Lithuanian —
the "en" storage key is a data-entry artifact (those songs use "PR." /
"P1." verse prefixes and "$" line-start display markers instead of the
"(Priedainis)" labels of the "lt" entries). Both marker styles are kept
verbatim; only the layout is normalized to the system's verse contract
(one verse = one \r\n-separated line):

  - each verses[] item becomes one line of song_list.TEXT_LT;
  - line breaks INSIDE a verse are joined with a space;
  - a leading "$" of a line (display marker) is stripped; lines empty
    after that (the "$" spacers between the Lithuanian and Russian parts
    of bilingual songs) are dropped;
  - whitespace is collapsed, titles too.

NUM is the module's number zero-padded to 3 digits ("001".."137") —
get_song_list sorts by NUM as a string. writer_text / writer_music /
suffix / key / audiourl are empty or junk and are not imported.

Run from this directory:  python build_tiktai_tikek.py
"""
import io, json, os, re, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = os.path.dirname(os.path.abspath(__file__))

LIST_NAME = 'Tiktai tikėk (Only Believe)'
SRC = os.path.join(ROOT, 'only_believe_module.json')
OUT = os.path.join(ROOT, 'tiktai_tikek.json')


def clean_verse(raw):
    lines = []
    for ln in (raw or '').split('\n'):
        ln = ln.strip()
        if ln.startswith('$'):
            ln = ln[1:].strip()
        if ln:
            lines.append(ln)
    return ' '.join(' '.join(lines).split())


def main():
    with io.open(SRC, encoding='utf-8-sig') as f:
        data = json.load(f)
    meta = data.pop('__moduleMetaInfo', {})
    print('module: id=%s title=%r lastmodified=%s, songs=%d'
          % (meta.get('id'), meta.get('title'), meta.get('lastmodified'), len(data)))

    songs = []
    for k, v in sorted(data.items(), key=lambda kv: int(kv[0])):
        num = int(v['number'])
        entries = v.get('i18n') or {}
        if len(entries) != 1:
            raise ValueError('song %d: expected exactly one i18n entry, got %r' % (num, list(entries)))
        e = next(iter(entries.values()))
        name = ' '.join((e.get('title') or '').split())
        verses = [clean_verse(t) for t in e.get('verses') or []]
        verses = [t for t in verses if t]
        if not name:
            raise ValueError('song %d: empty title' % num)
        if not verses:
            raise ValueError('song %d (%s): no verses' % (num, name))
        songs.append({'num': '%03d' % num, 'name': name, 'text_lt': '\r\n'.join(verses)})

    nums = [s['num'] for s in songs]
    assert len(nums) == len(set(nums)), 'duplicate NUMs'
    out = {'list_name': LIST_NAME, 'lang_column': 'TEXT_LT', 'source_module': meta, 'songs': songs}
    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write('\n')
    total_verses = sum(s['text_lt'].count('\r\n') + 1 for s in songs)
    print('wrote %s: %d songs, %d verse lines, %d chars'
          % (os.path.basename(OUT), len(songs), total_verses, os.path.getsize(OUT)))


if __name__ == '__main__':
    main()
