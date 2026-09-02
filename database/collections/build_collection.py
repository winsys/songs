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

# ---- language detection for --split-langs ------------------------------
# Cyrillic decides ru, Lithuanian diacritics decide lt; for plain-Latin
# lines a wordlist vote decides en vs lt (>=2 distinctive English words
# beating the Lithuanian hits). English words that are also Lithuanian
# words (to, be, no, so, on, ...) are deliberately absent from the list.
LT_CHARS = set('ąčęėįšųūžĄČĘĖĮŠŲŪŽ')
EN_WORDS = set("""the and you your my is are was were will shall for of that this
with when what who how there here from have has come came love lord jesus god
holy spirit heart soul glory grace believe just only every never forever
i'm you're it's don't can't waiting voice word alone face down deeper
me him his her they we us our all""".split())
LT_WORDS = set("""ir aš tu jis ji mes jūs mano tavo savo yra buvo bus esu esi
kad kaip su per bet man tau mus jums tik vien dabar čia kur kas jei nes dar
dievas dievo viešpats viešpaties jėzus jėzaus dvasia širdis meilė malonė
tave mane ant juk jos nebus visada gyvensiu kalno žodis žodžiu vardas""".split())

# Homoglyphs inside a mixed-script word are repaired toward the word's
# MAJORITY script: "Amžinas" with a Cyrillic A becomes fully Latin, a
# Russian word typed with a Latin T becomes fully Cyrillic.
CYR2LAT = {'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H',
           'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X',
           'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c',
           'у': 'y', 'х': 'x', 'і': 'i'}
LAT2CYR = {'A': 'А', 'B': 'В', 'E': 'Е', 'K': 'К', 'M': 'М', 'H': 'Н',
           'O': 'О', 'P': 'Р', 'C': 'С', 'T': 'Т', 'X': 'Х',
           'a': 'а', 'e': 'е', 'o': 'о', 'p': 'р', 'c': 'с',
           'y': 'у', 'x': 'х', 'i': 'і'}
CYR = re.compile(u'[\u0400-\u04ff]')


def fix_homoglyphs(line, log, where):
    def repl(m):
        w = m.group(0)
        cyr = len(CYR.findall(w))
        lat = len(re.findall(u'[A-Za-zĄ-ž]', w))
        if not cyr or not lat:
            return w
        table = CYR2LAT if lat >= cyr else LAT2CYR
        fixed = ''.join(table.get(c, c) for c in w)
        bad = CYR if lat >= cyr else re.compile(u'[A-Za-zĄ-ž]')
        if fixed != w and not bad.search(fixed):
            log.append('%s: %s -> %s' % (where, w, fixed))
            return fixed
        return w
    return re.sub(u"[0-9A-Za-zĄ-ž\u0400-\u04ff'’]+", repl, line)


def line_lang(ln):
    """'ru' / 'lt' / 'en', or None when the line carries no letters."""
    if CYR.search(ln):
        return 'ru'
    if any(c in LT_CHARS for c in ln):
        return 'lt'
    words = re.findall(u"[a-zA-Z'’]+", ln.lower())
    if not words:
        return None
    en = sum(1 for w in words if w.replace(u'’', "'") in EN_WORDS)
    lt = sum(1 for w in words if w in LT_WORDS)
    if en >= 2 and en > lt:
        return 'en'
    return 'lt'


def verse_lang_runs(raw, log, where, latin_default=None):
    """[(lang, text)] — consecutive same-language line groups of one verse.
    Lines without letters attach to the current (or next) run.
    latin_default overrides the 'lt' fallback of plain-Latin lines (songs
    with no Lithuanian diacritics at all — see the caller)."""
    runs = []
    pend = []
    for ln in (raw or '').split('\n'):
        ln = ln.strip()
        if ln.startswith('$'):
            ln = ln[1:].strip()
        if not ln:
            continue
        ln = fix_homoglyphs(ln, log, where)
        lg = line_lang(ln)
        if lg == 'lt' and latin_default and not any(c in LT_CHARS for c in ln) \
                and not any(w in LT_WORDS for w in re.findall(u"[a-zA-Z'’]+", ln.lower())):
            lg = latin_default
        if lg is None:
            (runs[-1][1] if runs else pend).append(ln)
            continue
        if runs and runs[-1][0] == lg:
            runs[-1][1].append(ln)
        else:
            runs.append((lg, pend + [ln]))
            pend = []
    if pend:
        if runs:
            runs[-1][1].extend(pend)
        else:
            runs.append(('lt', pend))
    # Verse-level smoothing: 'lt' is also the blind fallback for plain-Latin
    # lines, so inside a verse that has English but no HARD Lithuanian
    # (diacritics or wordlist hits), evidence-free 'lt' runs are English
    # ("I wanna be a vessel you work through" next to English lines).
    def hard_lt(lines):
        for l in lines:
            if any(c in LT_CHARS for c in l):
                return True
            if any(w in LT_WORDS for w in re.findall(u"[a-zA-Z'’]+", l.lower())):
                return True
        return False
    if any(lg == 'en' for lg, _ in runs) and \
            not any(lg == 'lt' and hard_lt(lines) for lg, lines in runs):
        runs = [('en' if lg == 'lt' else lg, lines) for lg, lines in runs]
    out = []
    for lg, lines in runs:
        txt = ' '.join(' '.join(lines).split())
        if lg == 'en':
            txt = re.sub(r'^EN\.\s*', '', txt)   # redundant language label
        if out and out[-1][0] == lg:
            out[-1] = (lg, out[-1][1] + ' ' + txt)
        else:
            out.append((lg, txt))
    return out


def split_song_langs(verse_runs_list):
    """verse_runs_list: [[(lang, text), ...] per verse] ->
    ({lang: [slot per verse]}, kind). Slots keep cross-language verse
    alignment. A song whose verses are each single-language and follow a
    repeating lt,ru[,en] cycle (translated verses after the original) is
    regrouped so cycle position i becomes verse i of every language."""
    order = []
    for v in verse_runs_list:
        for lg, _ in v:
            if lg not in order:
                order.append(lg)
    if len(order) > 1 and all(len(v) == 1 for v in verse_runs_list):
        seq = [v[0][0] for v in verse_runs_list]
        k = len(order)
        if len(seq) % k == 0 and seq == order * (len(seq) // k):
            cols = dict((lg, []) for lg in order)
            for i in range(0, len(seq), k):
                for j, lg in enumerate(order):
                    cols[lg].append(verse_runs_list[i + j][0][1])
            return cols, 'across'
    cols = dict((lg, []) for lg in order)
    for v in verse_runs_list:
        got = dict(v)
        for lg in order:
            cols[lg].append(got.get(lg, ''))
    return cols, ('inverse' if len(order) > 1 else 'mono')


def clean_verse(raw):
    lines = []
    for ln in (raw or '').split('\n'):
        ln = ln.strip()
        if ln.startswith('$'):
            ln = ln[1:].strip()
        if ln:
            lines.append(ln)
    return ' '.join(' '.join(lines).split())


# Trailing language-list markers in module titles ("Esame kelionėj LT / RU",
# "Aš noriu būt toks, kaip Tu - LT/ RU/ EN", "… - LT/RU/ENG", "… - RU/LT"):
# redundant once the languages live in their own columns. Uppercase tokens
# only, at least two of them joined by "/", at the very end of the title.
LANG_TAIL = re.compile(r'\s*[-–—]?\s*(LT|RU|EN|ENG)(\s*/\s*(LT|RU|EN|ENG))+\s*$')


def song_name(entry_title, key, suffix):
    name = ' '.join((entry_title or '').split())
    name = LANG_TAIL.sub('', name).rstrip(' -–—')
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
    ap.add_argument('--split-langs', help='detect and separate languages mixed inside one i18n entry '
                    '(Lithuanian/Russian/English line groups inside a verse, or translated verses '
                    'following the original in a repeating cycle); ignores the i18n keys like '
                    '--force-lang and requires one entry per song. Value: comma list of allowed '
                    'codes, e.g. lt,ru,en')
    args = ap.parse_args()

    with io.open(args.src, encoding='utf-8-sig') as f:
        data = json.load(f)
    meta = data.pop('__moduleMetaInfo', {})
    print('module: id=%s title=%r lastmodified=%s, songs=%d'
          % (meta.get('id'), meta.get('title'), meta.get('lastmodified'), len(data)))

    songs = []
    lang_counts = {}
    homoglyph_log = []
    split_report = []
    for k, v in sorted(data.items(), key=lambda kv: int(kv[0])):
        num = int(v['number'])
        entries = v.get('i18n') or {}
        if not entries:
            raise ValueError('song %d: no i18n entries' % num)
        if (args.force_lang or args.split_langs) and len(entries) != 1:
            raise ValueError('song %d: --force-lang/--split-langs need exactly one i18n entry, got %r'
                             % (num, list(entries)))
        texts = {}
        vcounts = {}
        if args.split_langs:
            allowed = [x.strip() for x in args.split_langs.split(',') if x.strip()]
            e = next(iter(entries.values()))
            all_lines = '\n'.join(e.get('verses') or [])
            # No Lithuanian diacritics anywhere in the song: 'lt' can only
            # be the blind fallback, so plain-Latin lines are English
            # whenever the song shows any real English evidence.
            latin_default = None
            if not any(c in LT_CHARS for c in all_lines):
                for ln in all_lines.split('\n'):
                    if line_lang(fix_homoglyphs(ln.strip().lstrip('$').strip(), [], '')) == 'en':
                        latin_default = 'en'
                        break
            vruns = []
            for vi, t in enumerate(e.get('verses') or [], 1):
                runs = verse_lang_runs(t, homoglyph_log, 'song %d verse %d' % (num, vi),
                                       latin_default=latin_default)
                for lg, _ in runs:
                    if lg not in allowed:
                        raise ValueError('song %d verse %d: detected language %r not in --split-langs'
                                         % (num, vi, lg))
                if runs:
                    vruns.append(runs)
            if not vruns:
                raise ValueError('song %d: no verses' % num)
            cols, kind = split_song_langs(vruns)
            for lg in list(cols):
                slots = cols[lg]
                while slots and not slots[-1]:
                    slots.pop()
                if not any(slots):
                    continue
                texts[lg] = '\r\n'.join(slots)
                vcounts[lg] = len(slots)
                lang_counts[lg] = lang_counts.get(lg, 0) + 1
            if kind != 'mono':
                split_report.append((num, kind, dict((lg, t.count('\r\n') + 1) for lg, t in texts.items())))
        else:
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
        if not texts:
            raise ValueError('song %d: no text' % num)
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
    if homoglyph_log:
        print('  fixed Cyrillic homoglyphs inside Latin words (%d):' % len(homoglyph_log))
        for entry in homoglyph_log:
            print('    ' + entry)
    if split_report:
        print('  language-split songs (%d):' % len(split_report))
        for num, kind, counts in split_report:
            print('    #%03d %-8s %s' % (num, kind, counts))
    total_verses = sum(t.count('\r\n') + 1 for s in songs for t in s['texts'].values())
    print('wrote %s: %d songs, langs %s, %d verse lines, %d chars'
          % (os.path.basename(args.out), len(songs), lang_counts, total_verses, os.path.getsize(args.out)))


if __name__ == '__main__':
    main()
