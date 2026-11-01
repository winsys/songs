# «Песнь Возрождения» — build of the collection

The hymnal «Песнь Возрождения», edition of 3055 songs (Pavel 2026-11-01: «ту,
что постарше» of the two complete online editions, 3055 and 3300), as the
collection «Песнь Возрождения». NUM = the number of that edition, plain digits
(`1`…`3055`, no padding — `get_song_list` / `get_songs_for_search` sort numbers
by value). Output: `../pv.json` (tracked, applied with
`../apply_collection.php`) and the sheet-music JPEGs (`../pv_notes/`, NOT
tracked).

## Sources

- **Texts, edition 3055** — vifania.org.ua «Песнь возрождения» (church
  «Вифания», Kyiv): 300 list pages of 10 songs with the full texts
  (`/SongOfRevival?page=N`; rate limit 30 requests / minute). 3000 songs; the
  site's slips are fixed in `assemble_pv.py`:
  - 1315, 1432, 1791 are stored one number off (at 1314, 1423, 1781), the song
    of that number lost — moved back, the lost songs taken from hvalite;
  - 800–849 and 1716 are missing — taken from hvalite.com («Песнь возрождения»
    3300: the two editions have the same numbers there — 790–799 and 850–856
    agree, and so does the 2800 edition's audio on archive.org `songsofrevival`);
  - 3036 is missing and cannot be filled (the editions differ at the end) —
    the collection has 3054 songs;
  - a capital letter split off its word at a line end («мои, О» / «ткуда») is
    re-joined (`pvtext.rejoin`, 37 places).
- **Sheet music** — МСЦ ЕХБ «Песни христиан, том 1 (Песнь Возрождения)», 2002,
  800 songs, 915 one-song vector PDFs (zip from mscmusic.org, collection
  `PV`; © Издательство «Христианин» МСЦ ЕХБ, free download), with the
  publisher's lyrics from `https://mscmusic.org/api/works/PV-NNN`. Its own
  numbering (1–800) — each song is matched to the 3055 number by the first
  ~70 characters of its first stanza (`match_msc.py`, accepted >= 0.85), then
  by the same first or second line (`rematch.py`, >= 0.7), then by its first
  line found once in the opening of a 3055 text (`rematch3.py`; three of those
  had other words after the first line and were rejected by hand): 737 of the
  800 songs → 736 numbers, 735 with sheets (the zip lacks №771's PDF); the
  rest are not in the 3055 edition or have other words; one number claimed
  twice keeps the better match; variants «а/б/в/г»
  are different tunes → groups «НОТЫ» / «2-Й НАПЕВ» / «3-Й НАПЕВ» / «4-Й
  НАПЕВ». `render_msc.py` renders a PDF at 200 dpi, crops the music (the
  section title above the song and the page footer are dropped), stacks the
  pages and replaces the printed MSC number with the 3055 number (the book's
  font encodes digits as 0x14–0x1D, so the number is found in the title span).
- **Chords** — no systematic source exists; only single songs on
  holychords / amdm.

## Format of the texts

One line per stanza, house style of the Russian collections: `N. …` for a
verse, `* …` for a chorus (printed once, where the source prints it). NAME =
the first line of the song (repeat signs and trailing punctuation dropped).

## Steps

```
python -I fetch_pages.py work/vif "https://vifania.org.ua/SongOfRevival?page={n}" 1 300 2.5
python -I parse_vif.py work/vif work/vif.json
python -I fetch_pages.py work/hvl "https://hvalite.com/pesni?page={n}" 1 110 1.0
python -I parse_hvl.py work/hvl work/hvl.json
python -I fetch_hv_songs.py work/hvl.json work/hvs 800-849 1314 1423 1716 1781
python -I parse_hvs.py work/hvs work/hvs_gap.json
python assemble_pv.py work/vif.json work/hvs_gap.json work/pv_raw.json

# notes: the zip of mscmusic.org collection PV (downloadUrl of /api/collections), its works and lyrics
python -I unzip_msc.py <PV.zip> work/msc_pdf
python -I msc_fetch.py work PV                          # -> work/msc_PV.json (works list)
python -I msc_lyrics.py work/msc_PV.json work/msc
python match_msc.py work/pv_raw.json work/msc work/msc_pdf work/match.json
python rematch.py work/pv_raw.json work/msc work/match.json
python rematch3.py work/pv_raw.json work/msc work/match.json --apply
python render_all.py work/match.json ../pv_notes        # pip install pymupdf numpy pillow
python build_pv_json.py work/pv_raw.json ../pv_notes ../pv.json
```

## Applying (on the server)

```
php database/collections/apply_collection.php pv.json --images /tmp/pv_notes
```

creates the collection with its image groups, the songs, copies the sheets
and appends the collection to `available_lists` of Riga (`grant_groups`).
Once it is in use, never re-apply (song rows are recreated, playlists point to
`song_list.ID`) — insert single rows instead.
