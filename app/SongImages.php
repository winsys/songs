<?php

/**
 * Sheet-music image groups (Aug 2026).
 *
 * Every song collection (`list_names` row) owns an ordered list of image
 * groups (table `song_image_groups`; defaults "НОТЫ" + "АККОРДЫ"), and a song
 * can carry any number of images ("pages") in every group. Storage is
 * FILE-BASED — there is no per-image table, so the database can never drift
 * from the disk:
 *
 *   page 1 of the MAIN group  = /images/<LISTID>/<NUM>.jpg
 *                               (the legacy main sheet, derived everywhere
 *                               else in the app — unchanged; PNG bytes may
 *                               live under the .jpg name, like the tech
 *                               console upload has always done)
 *   every other page          = /images/<LISTID>/g<GROUP_ID>/<NUM>_<page>.<jpg|png>
 *
 * Listing is a directory scan filtered by an exact-NUM regex, so song numbers
 * containing "_" or "-" ("422_C", "503_E-F") cannot collide with page suffixes.
 * Group directories are named by the immutable group ID: renaming or
 * reordering a group never moves files.
 *
 * Used by Ajax_Common::get_notes (musician page) and the Ajax_Import group /
 * ZIP commands. Pure helpers (parseEntryName, decodeName, isSafeNum) have no
 * DB dependency and are unit-testable standalone.
 */
class SongImages
{
    const DEFAULT_MAIN_NAME   = 'НОТЫ';
    const DEFAULT_SECOND_NAME = 'АККОРДЫ';

    /** Accepted page-file extensions (stored lowercase; "jpeg" is saved as "jpg"). */
    const EXT_PATTERN = 'jpe?g|png';

    /** @var bool|null Per-request cache of the groups table existence. */
    private static $tableChecked = null;

    // ─── Groups (DB) ─────────────────────────────────────────────────

    /**
     * Ordered groups of a collection. Seeds the two default groups on first
     * use (collections created before the feature, or by other means).
     * Returns [] when the table does not exist yet (pre-migration server).
     */
    public static function groups($listId, $ensure = true)
    {
        $listId = (int)$listId;
        if ($listId <= 0 || !self::tableExists()) {
            return [];
        }
        $rows = self::load($listId);
        if (!$rows && $ensure) {
            self::ensureDefaults($listId);
            $rows = self::load($listId);
        }
        return $rows;
    }

    /** One group row by ID (or null). */
    public static function group($groupId)
    {
        $groupId = (int)$groupId;
        if ($groupId <= 0 || !self::tableExists()) {
            return null;
        }
        $row = Info::get('db')->get(
            "SELECT ID, LISTID, NAME, SORT_ORDER, IS_MAIN FROM song_image_groups WHERE ID = {$groupId}"
        );
        return $row ?: null;
    }

    /** The group that holds the legacy main sheet (falls back to the first group). */
    public static function mainGroup(array $groups)
    {
        foreach ($groups as $g) {
            if ((int)$g['IS_MAIN'] === 1) {
                return $g;
            }
        }
        return $groups ? $groups[0] : null;
    }

    /** Insert the default groups for a collection that has none. */
    public static function ensureDefaults($listId)
    {
        $listId = (int)$listId;
        if ($listId <= 0 || !self::tableExists()) {
            return;
        }
        $db  = Info::get('db');
        $dbh = Info::get('dbh');
        $cnt = (int)$db->getValue("SELECT COUNT(*) FROM song_image_groups WHERE LISTID = {$listId}");
        if ($cnt > 0) {
            return;
        }
        $main   = mysqli_real_escape_string($dbh, self::DEFAULT_MAIN_NAME);
        $second = mysqli_real_escape_string($dbh, self::DEFAULT_SECOND_NAME);
        $db->exec("INSERT INTO song_image_groups (LISTID, NAME, SORT_ORDER, IS_MAIN) VALUES ({$listId}, '{$main}', 1, 1)");
        $db->exec("INSERT INTO song_image_groups (LISTID, NAME, SORT_ORDER, IS_MAIN) VALUES ({$listId}, '{$second}', 2, 0)");
    }

    private static function load($listId)
    {
        return Info::get('db')->select(
            "SELECT ID, LISTID, NAME, SORT_ORDER, IS_MAIN
             FROM song_image_groups
             WHERE LISTID = {$listId}
             ORDER BY SORT_ORDER, ID"
        );
    }

    private static function tableExists()
    {
        if (self::$tableChecked === null) {
            $row = Info::get('db')->get("SHOW TABLES LIKE 'song_image_groups'");
            self::$tableChecked = !empty($row);
        }
        return self::$tableChecked;
    }

    // ─── Paths ───────────────────────────────────────────────────────

    /** Absolute directory of a collection's images. */
    public static function listDir($listId)
    {
        return __DIR__ . '/../public/images/' . (int)$listId;
    }

    /** Absolute directory of a group's page files. */
    public static function groupDir($listId, $groupId)
    {
        return self::listDir($listId) . '/g' . (int)$groupId;
    }

    /** Web path of a group's directory. */
    public static function groupUrl($listId, $groupId)
    {
        return '/images/' . (int)$listId . '/g' . (int)$groupId;
    }

    /** Web path of the legacy main sheet of a song. */
    public static function mainImageUrl($listId, $num)
    {
        return '/images/' . (int)$listId . '/' . $num . '.jpg';
    }

    /**
     * A song number is safe to use as a file-name stem: anything except path
     * separators, control characters and the "." / ".." pseudo-names.
     * Numbers like "д001", "304 (1)" or "422_C" are all valid.
     */
    public static function isSafeNum($num)
    {
        $num = (string)$num;
        if ($num === '' || $num === '.' || $num === '..' || strlen($num) > 200) {
            return false;
        }
        return !preg_match('#[/\\\\\x00-\x1F]#', $num);
    }

    // ─── Listing ─────────────────────────────────────────────────────

    /**
     * Page images of one song in one group, ordered by page number.
     * Returns web paths ('/images/...').
     */
    public static function songPages($listId, array $group, $num)
    {
        $listId = (int)$listId;
        if (!self::isSafeNum($num)) {
            return [];
        }
        $isMain = ((int)$group['IS_MAIN'] === 1);
        $out    = [];
        if ($isMain && is_file(self::listDir($listId) . '/' . $num . '.jpg')) {
            $out[1] = self::mainImageUrl($listId, $num);
        }
        $dir = self::groupDir($listId, $group['ID']);
        if (is_dir($dir)) {
            $re = '/^' . preg_quote($num, '/') . '_(\d{1,3})\.(' . self::EXT_PATTERN . ')$/i';
            foreach (scandir($dir) as $f) {
                if (!preg_match($re, $f, $m)) {
                    continue;
                }
                $page = (int)$m[1];
                // Page 1 of the main group lives in the collection root only.
                if ($page < 1 || ($isMain && $page === 1) || isset($out[$page])) {
                    continue;
                }
                $out[$page] = self::groupUrl($listId, $group['ID']) . '/' . $f;
            }
        }
        ksort($out);
        return array_values($out);
    }

    /** Number of image files a group holds (all songs of the collection). */
    public static function countImages($listId, array $group)
    {
        $n = 0;
        if ((int)$group['IS_MAIN'] === 1) {
            $root = self::listDir($listId);
            if (is_dir($root)) {
                foreach (scandir($root) as $f) {
                    if (preg_match('/\.jpg$/i', $f) && is_file($root . '/' . $f)) {
                        $n++;
                    }
                }
            }
        }
        $dir = self::groupDir($listId, $group['ID']);
        if (is_dir($dir)) {
            foreach (scandir($dir) as $f) {
                if (preg_match('/_\d{1,3}\.(' . self::EXT_PATTERN . ')$/i', $f)) {
                    $n++;
                }
            }
        }
        return $n;
    }

    // ─── Import helpers ──────────────────────────────────────────────

    /**
     * Decode an archive entry name to UTF-8. Names flagged/valid as UTF-8 are
     * kept; anything else is assumed to be DOS Cyrillic (CP866 — what Windows
     * Explorer writes for Russian file names), which ZipArchive would also
     * hand over undecoded.
     */
    public static function decodeName($raw)
    {
        $raw = (string)$raw;
        if ($raw === '' || preg_match('//u', $raw)) {
            return $raw;
        }
        if (function_exists('mb_convert_encoding')) {
            $c = @mb_convert_encoding($raw, 'UTF-8', 'CP866');
            if (is_string($c) && $c !== '') {
                return $c;
            }
        }
        if (function_exists('iconv')) {
            $c = @iconv('CP866', 'UTF-8//IGNORE', $raw);
            if (is_string($c) && $c !== '') {
                return $c;
            }
        }
        return preg_replace('/[^\x20-\x7E]/', '_', $raw);
    }

    /**
     * Map an archive entry to a (song number, page, extension) triple using the
     * collection's known song numbers ($numSet = [NUM => true, ...]):
     *
     *   "001.jpg"    → num "001",   page 1
     *   "001_2.png"  → num "001",   page 2  (unless "001_2" is itself a song number)
     *   "422_C.jpg"  → num "422_C", page 1  (an exact song number always wins)
     *   "x/y/003.jpg"→ num "003",   page 1  (directories inside the ZIP are ignored)
     *
     * Returns null for directories / hidden files, ['error' => 'notImage'] for
     * other extensions, otherwise ['name', 'num', 'page', 'ext', 'known'].
     * Unknown numbers are still returned (known=false): images may be imported
     * before the song texts, exactly as the old import allowed.
     */
    public static function parseEntryName($rawName, array $numSet)
    {
        $name = self::decodeName($rawName);
        if ($name === '' || substr($name, -1) === '/' || substr($name, -1) === '\\') {
            return null;
        }
        // Bytes-safe basename: PHP's basename() is locale-dependent and can
        // strip leading multibyte characters (e.g. "д001.jpg" → "001.jpg").
        $base = preg_replace('#^.*[/\\\\]#', '', $name);
        if ($base === '' || $base[0] === '.') {
            return null;
        }
        if (!preg_match('/^(.+)\.([A-Za-z0-9]+)$/', $base, $m)) {
            return ['name' => $name, 'error' => 'notImage'];
        }
        $stem = trim($m[1]);
        $ext  = strtolower($m[2]);
        if ($ext === 'jpeg') {
            $ext = 'jpg';
        }
        if ($ext !== 'jpg' && $ext !== 'png') {
            return ['name' => $name, 'error' => 'notImage'];
        }
        if ($stem === '') {
            return ['name' => $name, 'error' => 'notImage'];
        }

        $num   = $stem;
        $page  = 1;
        $known = isset($numSet[$stem]);
        if (!$known && preg_match('/^(.+?)[ _\-]+(\d{1,3})$/u', $stem, $p) && isset($numSet[$p[1]])) {
            $num   = $p[1];
            $page  = max(1, (int)$p[2]);
            $known = true;
        }
        return ['name' => $name, 'num' => $num, 'page' => $page, 'ext' => $ext, 'known' => $known];
    }

    /**
     * Where a page of a song lives: [absolute path, web path].
     * Page 1 of the main group is the legacy root file (always ".jpg").
     */
    public static function target($listId, array $group, $num, $page, $ext)
    {
        $page = max(1, (int)$page);
        if ((int)$group['IS_MAIN'] === 1 && $page === 1) {
            return [self::listDir($listId) . '/' . $num . '.jpg', self::mainImageUrl($listId, $num)];
        }
        $file = $num . '_' . $page . '.' . $ext;
        return [
            self::groupDir($listId, $group['ID']) . '/' . $file,
            self::groupUrl($listId, $group['ID']) . '/' . $file,
        ];
    }

    /**
     * Existing files occupying a page slot (any accepted extension, any
     * letter case — the listing is case-insensitive too, so a manually
     * copied "001_2.JPG" counts as the slot being taken).
     */
    public static function slotFiles($listId, array $group, $num, $page)
    {
        $page = max(1, (int)$page);
        if ((int)$group['IS_MAIN'] === 1 && $page === 1) {
            $f = self::listDir($listId) . '/' . $num . '.jpg';
            return is_file($f) ? [$f] : [];
        }
        $dir = self::groupDir($listId, $group['ID']);
        $out = [];
        if (is_dir($dir)) {
            $re = '/^' . preg_quote($num . '_' . $page, '/') . '\.(' . self::EXT_PATTERN . ')$/i';
            foreach (scandir($dir) as $f) {
                if (preg_match($re, $f) && is_file($dir . '/' . $f)) {
                    $out[] = $dir . '/' . $f;
                }
            }
        }
        return $out;
    }

    /** Remove a group's directory with all its page files (main sheets are never touched). */
    public static function deleteGroupFiles($listId, $groupId)
    {
        self::rmTree(self::groupDir($listId, $groupId));
    }

    private static function rmTree($dir)
    {
        if (!is_dir($dir)) {
            return;
        }
        foreach (scandir($dir) as $f) {
            if ($f === '.' || $f === '..') {
                continue;
            }
            $p = $dir . '/' . $f;
            if (is_dir($p) && !is_link($p)) {
                self::rmTree($p);
            } else {
                @unlink($p);
            }
        }
        @rmdir($dir);
    }
}
