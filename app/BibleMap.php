<?php

/**
 * Versification mapping between Bible translations.
 *
 * The imported translations follow numbering traditions that differ at
 * chapter level in exactly three books (verified against production data,
 * September 2026):
 *
 *   - Psalms (19):  the Synodal text uses LXX chapter numbering
 *                   (Пс 22 = Masoretic Ps 23); all others are Masoretic.
 *   - Joel (29):    German texts (Luther, Elberfelder) use the Hebrew
 *                   4-chapter split; all others have 3 chapters
 *                   (Hebrew 3:1-5 = common 2:28-32, Hebrew 4 = common 3).
 *   - Malachi (39): German texts have 3 chapters; all others 4
 *                   (Hebrew 3:19-24 = common 4:1-6).
 *
 * Verse-level differences inside a mapped psalm (superscriptions counted
 * as verse 1..2 in the Russian/German traditions but unnumbered in the
 * KJV family) are resolved by aligning segment ENDS — the extra verses
 * always sit at the psalm start. A source verse with no counterpart
 * (the superscription itself) maps to nothing.
 *
 * A translation's tradition is detected FROM THE DATA and cached per
 * request, so no schema or data changes are required:
 *   - Psalms:  max verse of chapter 9 > 30  => LXX (Ps 9 = Masoretic 9+10)
 *   - Joel:    4 chapters                   => Hebrew numbering
 *   - Malachi: 3 chapters                   => Hebrew numbering
 *
 * Books other than 19/29/39 are mapped verse-number-to-verse-number as
 * before: the remaining known divergences are rare one-verse shifts at
 * chapter boundaries, and every displayed language block carries its own
 * verse numbers, so a shift stays visible instead of silently wrong.
 */
class BibleMap
{
    const BOOK_PSALMS  = 19;
    const BOOK_JOEL    = 29;
    const BOOK_MALACHI = 39;

    /** @var array "trId:bookNum" => scheme string ('lxx'|'m'|'heb'|'common') */
    private static $schemeCache = array();

    /** @var array "trId:bookNum:ch" => int max verse number */
    private static $maxCache = array();

    /**
     * Build a verse map for one chapter of the source translation.
     *
     * @param int $bookNum    canonical book number (1-66)
     * @param int $chapterNum chapter in the SOURCE translation's numbering
     * @param int $srcTrId    source (primary) translation id
     * @param int $dstTrId    destination (parallel) translation id
     * @return array|null     srcVerseNum => ['c' => dstChapter, 'v' => dstVerse],
     *                        or null when plain same-number join applies
     */
    public static function buildVerseMap($bookNum, $chapterNum, $srcTrId, $dstTrId)
    {
        $bookNum    = (int)$bookNum;
        $chapterNum = (int)$chapterNum;

        if ($bookNum === self::BOOK_PSALMS) {
            $src = self::scheme($srcTrId, $bookNum);
            $dst = self::scheme($dstTrId, $bookNum);
            if ($src === $dst) {
                // Same chapter grid, but verse counting may still differ
                // (superscriptions) — end-align within the same chapter.
                $segments = array(array(1, null, $chapterNum, null, null));
            } else {
                $table = self::psalmSegmentsLxx();
                if ($src !== 'lxx') $table = self::invertSegments($table);
                $segments = isset($table[$chapterNum]) ? $table[$chapterNum] : array();
            }
            return self::applySegments($segments, $bookNum, $chapterNum, $srcTrId, $dstTrId);
        }

        if ($bookNum === self::BOOK_JOEL || $bookNum === self::BOOK_MALACHI) {
            $src = self::scheme($srcTrId, $bookNum);
            $dst = self::scheme($dstTrId, $bookNum);
            if ($src === $dst) return null;
            $table = ($bookNum === self::BOOK_JOEL)
                ? self::joelSegmentsHeb()
                : self::malachiSegmentsHeb();
            if ($src !== 'heb') $table = self::invertSegments($table);
            $segments = isset($table[$chapterNum]) ? $table[$chapterNum] : array();
            return self::applySegments($segments, $bookNum, $chapterNum, $srcTrId, $dstTrId);
        }

        return null;
    }

    // -----------------------------------------------------------
    // Segment tables. Each entry: chapter (in the canonical scheme
    // named in the method) => list of segments
    // [srcVerseFrom, srcVerseTo|null, dstChapter, dstVerseFrom|null, dstVerseTo|null]
    // where null bounds mean "1" / "chapter max" resolved from data.
    // -----------------------------------------------------------

    /** Psalms: LXX (source side) => Masoretic. */
    private static function psalmSegmentsLxx()
    {
        $seg = array();
        for ($c = 1; $c <= 8; $c++)     $seg[$c] = array(array(1, null, $c, null, null));
        $seg[9]   = array(array(1, 21, 9, null, null), array(22, null, 10, null, null));
        for ($c = 10; $c <= 112; $c++)  $seg[$c] = array(array(1, null, $c + 1, null, null));
        $seg[113] = array(array(1, 8, 114, null, null), array(9, null, 115, null, null));
        $seg[114] = array(array(1, null, 116, 1, 9));
        $seg[115] = array(array(1, null, 116, 10, null));
        for ($c = 116; $c <= 145; $c++) $seg[$c] = array(array(1, null, $c + 1, null, null));
        $seg[146] = array(array(1, null, 147, 1, 11));
        $seg[147] = array(array(1, null, 147, 12, null));
        for ($c = 148; $c <= 150; $c++) $seg[$c] = array(array(1, null, $c, null, null));
        return $seg;
    }

    /** Joel: Hebrew (source side) => common 3-chapter numbering. */
    private static function joelSegmentsHeb()
    {
        return array(
            1 => array(array(1, null, 1, null, null)),
            2 => array(array(1, null, 2, 1, 27)),
            3 => array(array(1, null, 2, 28, null)),
            4 => array(array(1, null, 3, null, null)),
        );
    }

    /** Malachi: Hebrew (source side) => common 4-chapter numbering. */
    private static function malachiSegmentsHeb()
    {
        return array(
            1 => array(array(1, null, 1, null, null)),
            2 => array(array(1, null, 2, null, null)),
            3 => array(array(1, 18, 3, null, null), array(19, null, 4, null, null)),
        );
    }

    /** Swap source and destination sides of a segment table. */
    private static function invertSegments($table)
    {
        $out = array();
        foreach ($table as $srcCh => $segments) {
            foreach ($segments as $s) {
                // [srcFrom, srcTo, dstCh, dstFrom, dstTo] => keyed by dstCh
                $out[$s[2]][] = array(
                    $s[3] === null ? 1 : $s[3], $s[4],
                    $srcCh, $s[0], $s[1],
                );
            }
        }
        return $out;
    }

    /**
     * Resolve segment bounds against actual chapter maxima and produce the
     * verse map. Alignment anchors at segment ends; a verse falling before
     * the destination segment start has no counterpart and is skipped.
     */
    private static function applySegments($segments, $bookNum, $chapterNum, $srcTrId, $dstTrId)
    {
        $map = array();
        foreach ($segments as $s) {
            $srcFrom = (int)$s[0];
            $srcTo   = $s[1] !== null ? (int)$s[1] : self::chapterMax($srcTrId, $bookNum, $chapterNum);
            $dstCh   = (int)$s[2];
            $dstFrom = $s[3] !== null ? (int)$s[3] : 1;
            $dstTo   = $s[4] !== null ? (int)$s[4] : self::chapterMax($dstTrId, $bookNum, $dstCh);
            if ($srcTo < $srcFrom || $dstTo < $dstFrom) continue; // chapter absent in data
            for ($v = $srcFrom; $v <= $srcTo; $v++) {
                $dstV = $dstTo - ($srcTo - $v);
                if ($dstV >= $dstFrom) {
                    $map[$v] = array('c' => $dstCh, 'v' => $dstV);
                }
            }
        }
        return $map;
    }

    // -----------------------------------------------------------
    // Data-driven scheme detection (cached per request)
    // -----------------------------------------------------------

    /** Numbering scheme of a translation for one of the divergent books. */
    private static function scheme($trId, $bookNum)
    {
        $key = $trId . ':' . $bookNum;
        if (isset(self::$schemeCache[$key])) return self::$schemeCache[$key];

        $trId = (int)$trId;
        if ($bookNum === self::BOOK_PSALMS) {
            // LXX Psalm 9 = Masoretic 9+10 combined (39 verses vs ~20).
            $scheme = self::chapterMax($trId, self::BOOK_PSALMS, 9) > 30 ? 'lxx' : 'm';
        } else {
            $maxCh = (int)Info::get('db')->getValue(
                "SELECT MAX(v.CHAPTER_NUM)
                 FROM bible_verses v
                 JOIN bible_books b ON b.ID = v.BOOK_ID
                 WHERE b.TRANSLATION_ID = {$trId} AND b.BOOK_NUM = " . (int)$bookNum
            );
            if ($bookNum === self::BOOK_JOEL) {
                $scheme = ($maxCh === 4) ? 'heb' : 'common';
            } else {
                $scheme = ($maxCh === 3) ? 'heb' : 'common';
            }
        }
        self::$schemeCache[$key] = $scheme;
        return $scheme;
    }

    /** Max verse number of a chapter (0 when the chapter is absent). */
    private static function chapterMax($trId, $bookNum, $chapterNum)
    {
        $key = $trId . ':' . $bookNum . ':' . $chapterNum;
        if (isset(self::$maxCache[$key])) return self::$maxCache[$key];

        $trId = (int)$trId;
        $val = (int)Info::get('db')->getValue(
            "SELECT MAX(v.VERSE_NUM)
             FROM bible_verses v
             JOIN bible_books b ON b.ID = v.BOOK_ID
             WHERE b.TRANSLATION_ID = {$trId}
               AND b.BOOK_NUM = " . (int)$bookNum . "
               AND v.CHAPTER_NUM = " . (int)$chapterNum
        );
        self::$maxCache[$key] = $val;
        return $val;
    }
}
