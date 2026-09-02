# -*- coding: utf-8 -*-
"""
Convert Bible source files (Zefania XML or getBible v2 JSON) into SQL
inserts compatible with the worship-songs schema (bible_translations
/ bible_books / bible_verses).

Run from this directory after placing the source files alongside this
script (see download URLs in main()):

  python build.py

Each translation is emitted as a self-contained SQL file that creates
its own bible_translations / bible_books / bible_verses rows. Verse
text is written to bible_verses.TEXT and book names to bible_books.NAME
only — the legacy parallel columns (TEXT_LT/TEXT_EN/TEXT_DE,
NAME_LT/NAME_EN/NAME_DE) are unused by the per-translation model.

Sources are skipped (with a notice) if the matching file is not present.

Supported source loaders:
  - Zefania XML  (<XMLBIBLE><BIBLEBOOK><CHAPTER><VERS>)
  - getBible v2  (https://github.com/getbible/v2 — JSON with books[].chapters[].verses[])
  - module JSON  ({"__moduleMetaInfo": {…}, "<Book>": {"<chapter>": {"<verse>": text}}},
                  books in canonical order — the export format of Bible-app modules)

Outputs (overwrites if source available):
  luther1912.sql
  elberfelder1905.sql
  kjv.sql
  lithuanian.sql
  lt_kjv_2024.sql

Applying on the server (its mysql CLI fails with "Malformed packet"):
  php database/translations/apply.php lithuanian.sql
"""
import io, sys, os, json, re
import xml.etree.ElementTree as ET

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_TR_DIR = ROOT
OUT_MIG_DIR = os.path.normpath(os.path.join(ROOT, '..', 'migrations'))
os.makedirs(OUT_TR_DIR, exist_ok=True)

# Standard Lutherbibel book names (1-66, OT Genesis through NT Revelation).
# These match Luther 1912's bname attributes; reused for Elberfelder
# (which lacks bname in the XML) so both translations show identical
# book labels in the UI.
BOOK_NAMES_DE = {
    1:  '1. Mose',         2:  '2. Mose',         3:  '3. Mose',
    4:  '4. Mose',         5:  '5. Mose',         6:  'Josua',
    7:  'Richter',         8:  'Ruth',            9:  '1. Samuel',
    10: '2. Samuel',       11: '1. Könige',       12: '2. Könige',
    13: '1. Chronik',      14: '2. Chronik',      15: 'Esra',
    16: 'Nehemia',         17: 'Esther',          18: 'Hiob',
    19: 'Psalter',         20: 'Sprüche',         21: 'Prediger',
    22: 'Hohelied',        23: 'Jesaja',          24: 'Jeremia',
    25: 'Klagelieder',     26: 'Hesekiel',        27: 'Daniel',
    28: 'Hosea',           29: 'Joel',            30: 'Amos',
    31: 'Obadja',          32: 'Jona',            33: 'Micha',
    34: 'Nahum',           35: 'Habakuk',         36: 'Zephanja',
    37: 'Haggai',          38: 'Sacharja',        39: 'Maleachi',
    40: 'Matthäus',        41: 'Markus',          42: 'Lukas',
    43: 'Johannes',        44: 'Apostelgeschichte', 45: 'Römer',
    46: '1. Korinther',    47: '2. Korinther',    48: 'Galater',
    49: 'Epheser',         50: 'Philipper',       51: 'Kolosser',
    52: '1. Thessalonicher', 53: '2. Thessalonicher', 54: '1. Timotheus',
    55: '2. Timotheus',    56: 'Titus',           57: 'Philemon',
    58: 'Hebräer',         59: 'Jakobus',         60: '1. Petrus',
    61: '2. Petrus',       62: '1. Johannes',     63: '2. Johannes',
    64: '3. Johannes',     65: 'Judas',           66: 'Offenbarung',
}

# Canonical Lithuanian book names. Used as a fallback when the source
# file does not provide a name for a given book number. Aligned with
# the "Tikejimo Žodis" Lithuanian Bible distributed via CrossWire
# (the only freely-redistributable Lithuanian Bible).
BOOK_NAMES_LT = {
    1:  'Pradžios',          2:  'Išėjimo',          3:  'Kunigų',
    4:  'Skaičių',           5:  'Pakartoto Įstatymo', 6:  'Jozuės',
    7:  'Teisėjų',           8:  'Rūta',             9:  '1 Samuelio',
    10: '2 Samuelio',        11: '1 Karalių',        12: '2 Karalių',
    13: '1 Kronikų',         14: '2 Kronikų',        15: 'Ezra',
    16: 'Nehemijo',          17: 'Esteros',          18: 'Jobo',
    19: 'Psalmynas',         20: 'Patarlių',         21: 'Mokytojo',
    22: 'Giesmių giesmė',    23: 'Izaijo',           24: 'Jeremijo',
    25: 'Raudų',             26: 'Ezekielio',        27: 'Danieliaus',
    28: 'Ozėjo',             29: 'Joelio',           30: 'Amoso',
    31: 'Abdijo',            32: 'Jonos',            33: 'Michėjo',
    34: 'Nahumo',            35: 'Habakuko',         36: 'Sofonijo',
    37: 'Hagajo',            38: 'Zacharijo',        39: 'Malachijo',
    40: 'Mato',              41: 'Morkaus',          42: 'Luko',
    43: 'Jono',              44: 'Apaštalų darbai',  45: 'Romiečiams',
    46: '1 Korintiečiams',   47: '2 Korintiečiams',  48: 'Galatams',
    49: 'Efeziečiams',       50: 'Filipiečiams',     51: 'Kolosiečiams',
    52: '1 Tesalonikiečiams',53: '2 Tesalonikiečiams',54: '1 Timotiejui',
    55: '2 Timotiejui',      56: 'Titui',            57: 'Filemonui',
    58: 'Hebrajams',         59: 'Jokūbo',           60: '1 Petro',
    61: '2 Petro',           62: '1 Jono',           63: '2 Jono',
    64: '3 Jono',            65: 'Judo',             66: 'Apreiškimas',
}

# Canonical English (KJV) book names. Used as a fallback when the
# Zefania <BIBLEBOOK bname="..."> attribute is missing or empty.
BOOK_NAMES_EN = {
    1:  'Genesis',           2:  'Exodus',          3:  'Leviticus',
    4:  'Numbers',           5:  'Deuteronomy',     6:  'Joshua',
    7:  'Judges',            8:  'Ruth',            9:  '1 Samuel',
    10: '2 Samuel',          11: '1 Kings',         12: '2 Kings',
    13: '1 Chronicles',      14: '2 Chronicles',    15: 'Ezra',
    16: 'Nehemiah',          17: 'Esther',          18: 'Job',
    19: 'Psalms',            20: 'Proverbs',        21: 'Ecclesiastes',
    22: 'Song of Solomon',   23: 'Isaiah',          24: 'Jeremiah',
    25: 'Lamentations',      26: 'Ezekiel',         27: 'Daniel',
    28: 'Hosea',             29: 'Joel',            30: 'Amos',
    31: 'Obadiah',           32: 'Jonah',           33: 'Micah',
    34: 'Nahum',             35: 'Habakkuk',        36: 'Zephaniah',
    37: 'Haggai',            38: 'Zechariah',       39: 'Malachi',
    40: 'Matthew',           41: 'Mark',            42: 'Luke',
    43: 'John',              44: 'Acts',            45: 'Romans',
    46: '1 Corinthians',     47: '2 Corinthians',   48: 'Galatians',
    49: 'Ephesians',         50: 'Philippians',     51: 'Colossians',
    52: '1 Thessalonians',   53: '2 Thessalonians', 54: '1 Timothy',
    55: '2 Timothy',         56: 'Titus',           57: 'Philemon',
    58: 'Hebrews',           59: 'James',           60: '1 Peter',
    61: '2 Peter',           62: '1 John',          63: '2 John',
    64: '3 John',            65: 'Jude',            66: 'Revelation',
}


def sql_escape(s):
    """Escape a Python string for embedding inside a single-quoted SQL string."""
    return s.replace('\\', '\\\\').replace("'", "''")


def _verse_text(elem):
    """
    Walk a Zefania <VERS> element and concatenate verse text, skipping
    annotation children that are not part of the verse itself:
      NOTE — translator/study notes (Elberfelder uses these heavily)
      DIV  — formatting wrapper around NOTE/XREF
      XREF — cross-references
      GRAM — Strong's / grammar markers (e.g. Luther-Strongs build)
      gr   — same idea, lowercase
      BR   — line breaks (already represented by surrounding whitespace)
    Direct text and text inside <STYLE> (formatting) are kept.
    """
    SKIP = {'NOTE', 'DIV', 'XREF', 'GRAM', 'gr', 'BR'}
    parts = []
    if elem.text:
        parts.append(elem.text)
    for child in elem:
        if child.tag not in SKIP:
            parts.append(_verse_text(child))
        if child.tail:
            parts.append(child.tail)
    return ''.join(parts)


def load_zefania(path, fallback_names):
    """
    Return list of (book_num, chapter_num, verse_num, text) tuples plus
    book names map. fallback_names supplies a default name for books
    whose <BIBLEBOOK bname="…"> attribute is missing or empty.
    """
    tree = ET.parse(path)
    root = tree.getroot()
    verses = []
    book_names = {}
    for book in root.findall('BIBLEBOOK'):
        bn = int(book.get('bnumber'))
        bname = book.get('bname') or fallback_names.get(bn) or f'Book {bn}'
        book_names[bn] = bname
        for ch in book.findall('CHAPTER'):
            cn = int(ch.get('cnumber'))
            for v in ch.findall('VERS'):
                vn = int(v.get('vnumber'))
                txt = _verse_text(v).strip()
                txt = ' '.join(txt.split())
                if not txt:
                    # Verse consists only of a translator note (e.g. Acts 15:34
                    # in Elberfelder, which is missing in the earliest manuscripts).
                    # Keep the note in brackets so the verse number is not skipped.
                    raw = ' '.join(''.join(v.itertext()).split())
                    if raw:
                        txt = '[' + raw + ']'
                if txt:
                    verses.append((bn, cn, vn, txt))
    return book_names, verses


def load_getbible_json(path, fallback_names):
    """
    Return (book_names, verses) from a getBible v2 JSON file.

    Format:  { books: [ { nr, name, chapters: [ { chapter, verses:
             [ { verse, text } ] } ] } ] }

    The chapter/verse "name" fields are ignored — only book.nr,
    book.name and verse.text matter. fallback_names is used when
    book.name is missing or empty.
    """
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    verses = []
    book_names = {}
    for book in data.get('books', []):
        bn = int(book.get('nr'))
        bname = (book.get('name') or '').strip() or fallback_names.get(bn) or f'Book {bn}'
        book_names[bn] = bname
        for ch in book.get('chapters', []):
            cn = int(ch.get('chapter'))
            for v in ch.get('verses', []):
                vn = int(v.get('verse'))
                txt = (v.get('text') or '').strip()
                txt = ' '.join(txt.split())
                if txt:
                    verses.append((bn, cn, vn, txt))
    return book_names, verses


def load_module_json(path, fallback_names):
    """
    Return (book_names, verses) from a Bible-app "module" JSON export.

    Format:  { "__moduleMetaInfo": { id, language_code, shortname, title,
               bookshortnames[], … },
               "<Book name>": { "<chapter>": { "<verse>": "text", … }, … }, … }

    The format carries no book numbers: books are taken in file order and
    numbered 1-66 (the metadata's bookshortnames array is in the same
    canonical order). The top-level keys are the book names as the module
    shows them (Lithuanian genitive: "Pradžios", "Išėjimo", …). Verse text
    is plain except for occasional <br/> line breaks, which become spaces.
    fallback_names is used when a book key is empty.
    """
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    data.pop('__moduleMetaInfo', None)
    if len(data) != 66:
        raise ValueError(f'{os.path.basename(path)}: expected 66 books, got {len(data)}')

    verses = []
    book_names = {}
    repaired = []
    for bn, (bname, chapters) in enumerate(data.items(), 1):
        # Collapse inner whitespace too: module exports carry doubled spaces
        # in some names ("Laiškas  Hebrajams").
        book_names[bn] = ' '.join(bname.split()) or fallback_names.get(bn) or f'Book {bn}'
        for ck, vs in chapters.items():
            cn = int(ck)
            chap = {}
            for vk, txt in vs.items():
                txt = re.sub(r'<br\s*/?>', ' ', txt or '', flags=re.I)
                txt = ' '.join(txt.split())
                if txt:
                    chap[int(vk)] = txt
            _repair_merged_verses(chap, f'{book_names[bn]} {cn}', repaired)
            for vn in chap:
                verses.append((bn, cn, vn, chap[vn]))
    if repaired:
        print(f'    repaired merged verses ({len(repaired)}): ' + ', '.join(repaired))
    return book_names, verses


def _repair_merged_verses(chap, where, log):
    """
    Fix a module-export defect: a missing verse whose text sits inside the
    previous verse with the verse number as a literal marker ("…sinagogų.
    11 Ir štai ten buvo moteris…"). Splits verse n at the marker " n+1 "
    only when verse n+1 is absent, the marker occurs exactly once and both
    halves are non-empty — Bible text spells numbers out, so a lone digit
    group is the marker. Handles chains and chapter-trailing merges.
    chap is {verse_num: cleaned text}, modified in place.
    """
    changed = True
    while changed:
        changed = False
        for n in sorted(chap):
            nxt = n + 1
            if nxt in chap:
                continue
            txt = chap[n]
            marker = f' {nxt} '
            first = txt.find(marker)
            if first == -1 or txt.find(marker, first + 1) != -1:
                continue
            p1 = txt[:first].rstrip()
            p2 = txt[first + len(marker):].lstrip()
            if not p1 or not p2:
                continue
            chap[n], chap[nxt] = p1, p2
            log.append(f'{where}:{nxt}')
            changed = True


def emit_translation_sql(out_path, *, name, lang, sort_order, source_path, loader, fallback_names,
                         replace_lang=False, source_note=''):
    """
    Emit a self-contained SQL file that loads one translation. Skips
    silently (with a notice) if source_path is missing.

    loader is one of load_zefania / load_getbible_json / load_module_json —
    anything returning (book_names_map, [(book_num, chapter_num, verse_num, text), …]).

    replace_lang=True makes the file delete EVERY existing translation with
    the same LANG before inserting — for a translation swap, when the new
    file supersedes the language's previous Bible. The default deletes only
    a previous import of the same NAME. source_note is an optional
    provenance line for the file header.
    """
    if not os.path.isfile(source_path):
        print(f'  {os.path.basename(out_path)}: SKIPPED (missing {os.path.basename(source_path)})')
        return

    book_names, verses = loader(source_path, fallback_names)
    # Fill any books whose name was missing/empty with the fallback.
    for bn in range(1, 67):
        if not book_names.get(bn):
            book_names[bn] = fallback_names[bn]

    total_verses = len(verses)
    print(f'  {os.path.basename(out_path)}: {len(book_names)} books, {total_verses} verses')

    parts = []
    parts.append(f"-- {name} — auto-generated from {os.path.basename(source_path)}\n")
    parts.append("-- Self-contained: writes its own bible_translations / bible_books /\n")
    parts.append("-- bible_verses rows. Verse text goes to bible_verses.TEXT, book\n")
    parts.append("-- names to bible_books.NAME — no parallel-language columns used.\n")
    if source_note:
        parts.append(f"-- Source: {source_note}\n")
    if replace_lang:
        parts.append(f"-- Idempotency: re-running deletes EVERY existing LANG='{lang}' translation first\n")
        parts.append("-- (this file supersedes the language's previous Bible).\n\n")
    else:
        parts.append("-- Idempotency: re-running deletes the existing translation with the same NAME first.\n\n")
    parts.append("START TRANSACTION;\n\n")

    # Remove the previous translation(s) — the FK cascade deletes their books and verses.
    if replace_lang:
        parts.append(f"DELETE FROM bible_translations WHERE LANG = '{lang}';\n\n")
    else:
        parts.append(f"DELETE FROM bible_translations WHERE NAME = '{sql_escape(name)}' AND LANG = '{lang}';\n\n")

    # 1. Translation row.
    parts.append(
        f"INSERT INTO bible_translations (NAME, LANG, SORT_ORDER) "
        f"VALUES ('{sql_escape(name)}', '{lang}', {sort_order});\n"
    )
    parts.append("SET @tr := LAST_INSERT_ID();\n\n")

    # 2. Book rows — each followed by SET @bN := LAST_INSERT_ID();
    parts.append("-- Books\n")
    for bn in range(1, 67):
        nm = sql_escape(book_names[bn])
        parts.append(
            f"INSERT INTO bible_books (TRANSLATION_ID, BOOK_NUM, NAME) "
            f"VALUES (@tr, {bn}, '{nm}');\n"
        )
        parts.append(f"SET @b{bn} := LAST_INSERT_ID();\n")
    parts.append("\n")

    # 3. Verses — bulk INSERT in chunks of CHUNK rows to stay under max_allowed_packet.
    CHUNK = 200
    parts.append("-- Verses\n")
    for i in range(0, total_verses, CHUNK):
        chunk = verses[i:i + CHUNK]
        parts.append("INSERT INTO bible_verses (BOOK_ID, CHAPTER_NUM, VERSE_NUM, TEXT) VALUES\n")
        rows = []
        for bn, cn, vn, txt in chunk:
            rows.append(f"  (@b{bn}, {cn}, {vn}, '{sql_escape(txt)}')")
        parts.append(',\n'.join(rows))
        parts.append(';\n')
    parts.append("\nCOMMIT;\n")

    with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
        f.writelines(parts)


def main():
    print('Generating translation SQL:')

    # German — Zefania XML from sourceforge.net/projects/zefania-sharp
    emit_translation_sql(
        os.path.join(OUT_TR_DIR, 'luther1912.sql'),
        name='Luther 1912',
        lang='de',
        sort_order=10,
        source_path=os.path.join(ROOT, 'SF_2022-02-27_GER_LUTH1912_(LUTHER_1912).xml'),
        loader=load_zefania,
        fallback_names=BOOK_NAMES_DE,
    )
    emit_translation_sql(
        os.path.join(OUT_TR_DIR, 'elberfelder1905.sql'),
        name='Elberfelder 1905',
        lang='de',
        sort_order=11,
        source_path=os.path.join(ROOT, 'SF_2009-01-20_GER_ELB1905_(ELBERFELDER 1905).xml'),
        loader=load_zefania,
        fallback_names=BOOK_NAMES_DE,
    )

    # English — Zefania XML from sourceforge.net/projects/zefania-sharp
    emit_translation_sql(
        os.path.join(OUT_TR_DIR, 'kjv.sql'),
        name='King James Version',
        lang='en',
        sort_order=20,
        source_path=os.path.join(ROOT, 'SF_2009-01-23_ENG_KJV_(KING JAMES VERSION).xml'),
        loader=load_zefania,
        fallback_names=BOOK_NAMES_EN,
    )

    # Lithuanian — "Karaliaus Jokūbo versija 2016" (LT-KJV): the King James
    # Version translated into Lithuanian, KJV versification (31 102 verses).
    # Source: Bible-app module export lt_kjv_2016.json (module id 4,
    # lastmodified 2021-10-25), git-ignored like the other sources.
    # It replaced the earlier "Lithuanian Bible" (Tikėjimo Žodis via
    # getBible) on 2026-08-31. replace_lang was dropped in Sep 2026 when
    # the 2024 edition arrived: the language now carries two translations,
    # so re-running this file must replace only itself.
    emit_translation_sql(
        os.path.join(OUT_TR_DIR, 'lithuanian.sql'),
        name='Karaliaus Jokūbo versija 2016',
        lang='lt',
        sort_order=30,
        source_path=os.path.join(ROOT, 'lt_kjv_2016.json'),
        loader=load_module_json,
        fallback_names=BOOK_NAMES_LT,
        source_note='lt_kjv_2016.json — LT-KJV module (id 4, lastmodified 2021-10-25), KJV versification',
    )

    # Lithuanian — "Karaliaus Jokūbo versija 2024": the revised edition of
    # the same LT-KJV module (id 4, lastmodified 2026-04-24), added
    # ALONGSIDE the 2016 one (Sep 2026). Formal full book names
    # ("Evangelija Pagal Matą", "Pirmoji Samuelio Knyga", …). The export
    # carries 11 verses merged into their predecessor with a literal
    # number marker — load_module_json splits them back (see
    # _repair_merged_verses), restoring the full 31 102 KJV verses.
    emit_translation_sql(
        os.path.join(OUT_TR_DIR, 'lt_kjv_2024.sql'),
        name='Karaliaus Jokūbo versija 2024',
        lang='lt',
        sort_order=31,
        source_path=os.path.join(ROOT, 'lt_kjv_2024.json'),
        loader=load_module_json,
        fallback_names=BOOK_NAMES_LT,
        source_note='lt_kjv_2024.json — LT-KJV module (id 4, lastmodified 2026-04-24), KJV versification',
    )

    print('Done.')


if __name__ == '__main__':
    main()
