# -*- coding: utf-8 -*-
"""
Convert Zefania XML Bible files to SQL inserts compatible with the
worship-songs schema (bible_translations / bible_books / bible_verses).

Run from this directory after placing the two source XML files alongside
this script (see README.md for download URLs):

  python build.py

Outputs (overwrites):
  luther1912.sql
  elberfelder1905.sql
  ../migrations/add_bible_de_columns.sql
"""
import io, sys, os
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


def load_zefania(path):
    """Return list of (book_num, chapter_num, verse_num, text) tuples plus book names map."""
    tree = ET.parse(path)
    root = tree.getroot()
    verses = []
    book_names = {}
    for book in root.findall('BIBLEBOOK'):
        bn = int(book.get('bnumber'))
        bname = book.get('bname') or BOOK_NAMES_DE.get(bn) or f'Book {bn}'
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


def emit_translation_sql(out_path, *, name, lang, sort_order, source_xml):
    """Emit a self-contained SQL file that loads one translation."""
    book_names, verses = load_zefania(source_xml)
    # Override Luther's "Psalter" with the user's preferred form? No — Luther 1912 uses "Psalter".
    # Override with the canonical map for any book whose XML name is missing/empty.
    for bn in range(1, 67):
        if not book_names.get(bn):
            book_names[bn] = BOOK_NAMES_DE[bn]

    total_verses = len(verses)
    print(f'  {os.path.basename(out_path)}: {len(book_names)} books, {total_verses} verses')

    parts = []
    parts.append(f"-- {name} — auto-generated from {os.path.basename(source_xml)}\n")
    parts.append("-- Run AFTER add_bible_de_columns.sql.\n")
    parts.append("-- Idempotency: re-running deletes the existing translation with the same NAME first.\n\n")
    parts.append("START TRANSACTION;\n\n")

    # Remove any previous import of this translation (cascade deletes books and verses).
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
            f"INSERT INTO bible_books (TRANSLATION_ID, BOOK_NUM, NAME, NAME_DE) "
            f"VALUES (@tr, {bn}, '{nm}', '{nm}');\n"
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


def emit_migration():
    path = os.path.join(OUT_MIG_DIR, 'add_bible_de_columns.sql')
    content = """-- Migration: add German book/verse columns to the Bible tables
-- Required before importing Lutherbibel 1912 / Elberfelder 1905.
-- Safe to run multiple times: ALTER … ADD COLUMN IF NOT EXISTS not supported in MySQL 5.7,
-- so wrap in a stored procedure or check manually before re-running.

ALTER TABLE `bible_books`
    ADD COLUMN `NAME_DE` VARCHAR(255) DEFAULT NULL COMMENT 'Book name (DE)';

ALTER TABLE `bible_verses`
    ADD COLUMN `TEXT_DE` TEXT DEFAULT NULL COMMENT 'Verse text (DE)';

-- Rebuild the FULLTEXT index to include the new TEXT_DE column so search
-- in Bible mode finds German verses.
ALTER TABLE `bible_verses` DROP KEY `ft_bible_text`;
ALTER TABLE `bible_verses` ADD FULLTEXT KEY `ft_bible_text` (`TEXT`, `TEXT_LT`, `TEXT_EN`, `TEXT_DE`);
"""
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    print(f'  wrote {os.path.basename(path)}')


def main():
    print('Generating migration:')
    emit_migration()
    print('Generating translation SQL:')
    emit_translation_sql(
        os.path.join(OUT_TR_DIR, 'luther1912.sql'),
        name='Luther 1912',
        lang='de',
        sort_order=10,
        source_xml=os.path.join(ROOT, 'SF_2022-02-27_GER_LUTH1912_(LUTHER_1912).xml'),
    )
    emit_translation_sql(
        os.path.join(OUT_TR_DIR, 'elberfelder1905.sql'),
        name='Elberfelder 1905',
        lang='de',
        sort_order=11,
        source_xml=os.path.join(ROOT, 'SF_2009-01-20_GER_ELB1905_(ELBERFELDER 1905).xml'),
    )
    print('Done.')


if __name__ == '__main__':
    main()
