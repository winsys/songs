# «Гусли» — build of the collection

I. S. Prokhanov's hymnal «Гусли» (507 songs, public domain) as the collection
«Гусли»: texts from Wikisource, sheet music cut from a scan of the 1927 edition
with notes. Output: `../gusli.json` (tracked, applied with
`../apply_collection.php`) and one JPEG of sheet music per song and tune
(`../gusli_notes/`, NOT tracked — `/public/images` lives on the server only).

## Sources

- **Texts** — ru.wikisource.org, «Гусли (сборник)/Третье издание (ДО)»: 3rd
  edition, Halbstadt 1911, transcribed in the pre-1918 spelling (every song has a
  «/Гусли 1911 года (ДО)» subpage). Converted to modern spelling by `ortho.py`
  (rules of the 1918 reform + a word-form lexicon for the ambiguous endings and
  prefixes), calibrated against the ~180 «(ВТ)» modern copies made by Wikisource
  editors: about 170 differences in 19 846 words, most of them the editors' own
  slips. Transcription typos found on review are fixed in `build_texts.py`
  (`FIXES`).
- **Sheet music** — «Гусли: Сборник духовных песен с нотами. Составитель
  И. С. Проханов», Leningrad: All-Union Council of Evangelical Christians, 1927.
  British Library, Endangered Archives Programme, EAP1511/1/2/1/29
  (https://eap.bl.uk/archive-file/EAP1511-1-2-1-29), licence CC BY-NC 4.0 —
  non-commercial use with attribution. 286 photographed spreads (287 = cover),
  IIIF image API: at most 1200 px per request, so `fetch_scans.py` stitches
  1200×1200 regions, one request at a time (parallel downloads get HTTP 405).

The 1927 edition keeps the 1911 numbering. Differences:

- №84 is two songs: «84 а» «О люди, оживите!», «84 б» «Кто мне радость даст?»
  → NUM `084а` / `084б`;
- 44 songs have a second tune: 39 printed right after the first («4 а» /
  «4 б» …) and 5 in the appendix «XIV. Дополнения» (34 б, 39 б, 68 б, 180 б,
  302 б). The first tune is the song's image in the group «НОТЫ», the second one
  in the group «2-Й НАПЕВ» (`gusli_notes/tune2/`);
- №508–510 exist in 1927 only (not in the 1911 texts) — not part of the
  collection;
- the texts under the notes are the 1927 redaction and can differ from the 1911
  texts on screen (№485, a prayer for the Tsar in 1911, most of all).

## Format of the texts

NUM is zero-padded (`001`…`507`, `084а`, `084б`) because the song list sorts NUM
as a string; songs added on request that are not in the book are supplements
`д001`… (the convention of the other collections; `SUPPLEMENT` in
`build_texts.py`) — `д001` «Возвожу очи мои к горам» (Ps. 120, «Песнь
Возрождения» №2675, no sheet music). On prod a new row is inserted alone:
re-running `apply_collection.php` recreates every song row, and playlists
(`favorites.SONGID`) point to `song_list.ID`; NAME is the Wikisource title (modern spelling). One line per
stanza: `N. …` for verses, `Припев: …` / `Хор: …` for refrains (printed once,
where the source prints them); lines inside a stanza are joined with spaces;
the repeat sign `:,:` is kept.

## Steps

```
pip install numpy opencv-python-headless pillow
# lexicon for ortho.py: russian.txt next to the scripts (see ortho.py)

python fetch_texts.py work                      # -> work/songs_raw.json
python build_texts.py work/songs_raw.json ../gusli.json
python check_texts.py ../gusli.json             # merged stanzas, leftover markup

python fetch_scans.py work/full 1 286           # ~30 min
python detect.py work/full work/det.json 1 286  # pages, deskew, staff bands, headings
python render.py sheets work/full work/det.json none work/sheets
python make_labels.py work/sheets/heads.json work/labels.json
python render.py sheets work/full work/det.json work/labels.json work/sheets
#   check every label against the printed number on work/sheets/sheet_*.png
#   (555 headings); fix VARIANTS / FP / MISSING / EXPLICIT in make_labels.py and
#   songs_map.ADDED_HEADINGS until they all match, then
python render.py songs work/full work/det.json work/labels.json ../gusli_notes
#   (drop 508-510.jpg — not in the collection)
```

`detect.py`: staff lines → per-page deskew; staff bands (tolerant to page
curvature; the page's top edge is not a staff); song headings = a row of bold
glyphs of the heading font (x-height 23-31 px, stroke 3.4-5.4 px at scan
resolution — lyrics are thinner, note heads thicker); running headers and page
edges are cut off. Missed: «507. Аминь.» (too few glyphs) — `ADDED_HEADINGS`.
`render.py`: a song (tune) = from its heading to the next one, across pages; a
continuation at a page top counts only with a staff or > 350 px (book section
titles over the first heading are dropped), four mid-page section titles are
trimmed (`TRIM_TAIL`); parts are stacked, or set side by side when taller than
1.35 pages (one choral piece, 231 б, is a 2×3 grid); paper flattened to white;
85 % scale, JPEG q72.

## Applying (on the server)

```
php database/collections/apply_collection.php gusli.json --images /tmp/gusli_notes
```

creates the collection with the image groups «НОТЫ» + «2-Й НАПЕВ» (names in all
five UI languages), writes the songs, copies `<NUM>.jpg` / `tune2/<NUM>.jpg`
into the groups and appends the collection to `available_lists` of the groups
in `grant_groups` (1 = Riga). The JPEGs can be uploaded instead as two ZIPs on
the import page (image ZIP into «НОТЫ», and `tune2` into «2-Й НАПЕВ»).
