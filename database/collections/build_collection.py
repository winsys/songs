# -*- coding: utf-8 -*-
"""
Convert a song-app module export (the Kaunas/Panevėžys groups' song app;
same family as the Bible modules) into a tracked data file for
apply_collection.php.

  python build_collection.py <module.json> <out.json> --name "List name"

Module format, per song key "1".."N" (plus "__moduleMetaInfo"):
  { "number": 1, "key": ["E"], "writer_text": "", "writer_music": "",
    "suffix": "4.1.", "i18n": { "<lt|ru|en>": { "title": "...",
    "audiourl": "", "verses": ["line\nline\n...", ...] } } }

Every i18n entry is a real language of the SAME song (verse arrays are
aligned across languages) and maps onto the system's content-language
columns. Layout is normalized to the verse contract (one verse = one
\r\n-separated line):
  - each verses[] item becomes one line;
  - line breaks INSIDE a verse are joined with a space;
  - a leading "$" of a line (display marker of the source app) is
    stripped; lines empty after that (spacers) are dropped;
  - whitespace is collapsed, titles too.
Verse labels ("(Priedainis)", "PR.", "P1.", "1.", "*", …) are kept
verbatim — both marker conventions found in the modules stay readable.

NAME follows the system's own convention (see the Vilnius-HGB list):
"(<key>) <lt title> <suffix>" — the musical key from key[] and the
verse-structure code from suffix, both only when meaningful (junk
suffixes like "()" are dropped). The title of the 'lt' entry wins
(native collection language); other languages' titles are not stored
(song_list has a single NAME column). NUM is zero-padded to 3 digits —
get_song_list sorts by NUM as a string.

writer_text / writer_music / audiourl are not imported.
"""
import argparse, io, json, os, re, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')


def clean_verse(raw):
    lines = []
    for ln in (raw or '').split('\n'):
        ln = ln.strip()
        if ln.startswith('$'):
            ln = ln[1:].strip()
        if ln:
            lines.append(ln)
    return ' '.join(' '.join(lines).split())


def song_name(entry_title, key, suffix):
    name = ' '.join((entry_title or '').split())
    k = '/'.join(s.strip() for s in (key or []) if s and s.strip())
    if k:
        name = '(%s) %s' % (k, name)
    sfx = ' '.join((suffix or '').split())
    if sfx and re.search(r'[0-9A-Za-zĄ-ž]', sfx):
        name = '%s %s' % (name, sfx)
    return name


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--name', required=True, help='collection name (list_names.LIST_NAME)')
    ap.add_argument('--force-lang', help='store every song text under this content-language code '
                    '(for modules whose i18n keys are data-entry artifacts, e.g. the Kaunas '
                    'songbook keeps Lithuanian texts under "en"); requires one entry per song')
    args = ap.parse_args()

    with io.open(args.src, encoding='utf-8-sig') as f:
        data = json.load(f)
    meta = data.pop('__moduleMetaInfo', {})
    print('module: id=%s title=%r lastmodified=%s, songs=%d'
          % (meta.get('id'), meta.get('title'), meta.get('lastmodified'), len(data)))

    songs = []
    lang_counts = {}
    for k, v in sorted(data.items(), key=lambda kv: int(kv[0])):
        num = int(v['number'])
        entries = v.get('i18n') or {}
        if not entries:
            raise ValueError('song %d: no i18n entries' % num)
        if args.force_lang and len(entries) != 1:
            raise ValueError('song %d: --force-lang needs exactly one i18n entry, got %r'
                             % (num, list(entries)))
        texts = {}
        vcounts = {}
        for lg, e in entries.items():
            if args.force_lang:
                lg = args.force_lang
            verses = [clean_verse(t) for t in e.get('verses') or []]
            verses = [t for t in verses if t]
            if not verses:
                raise ValueError('song %d [%s]: no verses' % (num, lg))
            texts[lg] = '\r\n'.join(verses)
            vcounts[lg] = len(verses)
            lang_counts[lg] = lang_counts.get(lg, 0) + 1
        if len(set(vcounts.values())) > 1:
            print('  WARN song %d: verse counts differ across languages: %s' % (num, vcounts))
        title_entry = entries.get('lt') or next(iter(entries.values()))
        name = song_name(title_entry.get('title'), v.get('key'), v.get('suffix'))
        if not name:
            raise ValueError('song %d: empty title' % num)
        songs.append({'num': '%03d' % num, 'name': name, 'texts': texts})

    nums = [s['num'] for s in songs]
    assert len(nums) == len(set(nums)), 'duplicate NUMs'
    out = {'list_name': args.name, 'source_module': meta, 'songs': songs}
    with io.open(args.out, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write('\n')
    total_verses = sum(t.count('\r\n') + 1 for s in songs for t in s['texts'].values())
    print('wrote %s: %d songs, langs %s, %d verse lines, %d chars'
          % (os.path.basename(args.out), len(songs), lang_counts, total_verses, os.path.getsize(args.out)))


if __name__ == '__main__':
    main()
