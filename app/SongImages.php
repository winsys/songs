<?php

/**
 * Sheet-music image groups (Aug 2026).
 *
 * Every song collection (`list_names` row) owns an ordered list of image
 * groups ("types" — table `song_image_groups`; defaults "НОТЫ" + "АККОРДЫ",
 * names translatable per UI language), and a song has AT MOST ONE image in
 * every group. Storage is FILE-BASED — there is no per-image table, so the
 * database can never drift from the disk:
 *
 *   main group (IS_MAIN = 1) = /images/<LISTID>/<NUM>.jpg
 *                              (the legacy main sheet, derived everywhere
 *                              else in the app — unchanged; PNG bytes may
 *                              live under the .jpg name, like the tech
 *                              console upload has always done)
 *   every other group        = /images/<LISTID>/g<GROUP_ID>/<NUM>.<jpg|png>
 *                              (a legacy "<NUM>_1.<ext>" name written by the
 *                              first, multi-page build is still recognised)
 *
 * Listing is a directory scan filtered by an exact-NUM regex. Group
 * directories are named by the immutable group ID: renaming or reordering a
 * group never moves files.
 *
 * Used by Ajax_Common::get_notes (musician page) and the Ajax_Import group /
 * ZIP / per-song image commands. Pure helpers (parseEntryName, decodeName,
 * isSafeNum) have no DB dependency and are unit-testable standalone.
 */
class SongImages
{
    /** Default group names (NAME = the original; NAMES = per UI language). */
    const DEFAULT_MAIN_NAME    = 'НОТЫ';
    const DEFAULT_SECOND_NAME  = 'АККОРДЫ';
    const DEFAULT_MAIN_NAMES   = ['ru' => 'НОТЫ', 'de' => 'NOTEN', 'en' => 'SHEET MUSIC', 'lt' => 'NATOS'];
    const DEFAULT_SECOND_NAMES = ['ru' => 'АККОРДЫ', 'de' => 'AKKORDE', 'en' => 'CHORDS', 'lt' => 'AKORDAI'];

    /** UI languages a group name can be translated into (mirrors T::ALLOWED). */
    const UI_LANGS = ['ru', 'de', 'en', 'lt'];

    /** Accepted image-file extensions (stored lowercase; "jpeg" is saved as "jpg"). */
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
            "SELECT ID, LISTID, NAME, NAMES, SORT_ORDER, IS_MAIN FROM song_image_groups WHERE ID = {$groupId}"
        );
        return $row ?: null;
    }

    // ─── Multilingual names ──────────────────────────────────────────
    // NAME is the name the group was created with; NAMES (JSON
    // {ui_lang: name}) holds optional translations. A missing / empty
    // translation falls back to NAME.

    /** Translations of a group: [lang => name] (only non-empty, allowed languages). */
    public static function names(array $g)
    {
        $raw = isset($g['NAMES']) ? (string)$g['NAMES'] : '';
        $arr = $raw !== '' ? json_decode($raw, true) : null;
        $out = [];
        if (is_array($arr)) {
            foreach (self::UI_LANGS as $lang) {
                if (isset($arr[$lang]) && trim((string)$arr[$lang]) !== '') {
                    $out[$lang] = trim((string)$arr[$lang]);
                }
            }
        }
        return $out;
    }

    /** Name of a group in the given (default: current) UI language. */
    public static function displayName(array $g, $lang = null)
    {
        $lang  = $lang ?: (class_exists('T') ? T::lang() : 'ru');
        $names = self::names($g);
        return isset($names[$lang]) ? $names[$lang] : (string)$g['NAME'];
    }

    /** Normalize a translations array for storage; null when nothing is set. */
    public static function encodeNames($names)
    {
        $out = [];
        if (is_array($names)) {
            foreach (self::UI_LANGS as $lang) {
                $v = isset($names[$lang]) ? trim((string)preg_replace('/\s+/u', ' ', (string)$names[$lang])) : '';
                if ($v !== '') {
                    $out[$lang] = mb_substr($v, 0, 100, 'UTF-8');
                }
            }
        }
        return $out ? json_encode($out, JSON_UNESCAPED_UNICODE) : null;
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
        $main    = mysqli_real_escape_string($dbh, self::DEFAULT_MAIN_NAME);
        $second  = mysqli_real_escape_string($dbh, self::DEFAULT_SECOND_NAME);
        $mainN   = mysqli_real_escape_string($dbh, self::encodeNames(self::DEFAULT_MAIN_NAMES));
        $secondN = mysqli_real_escape_string($dbh, self::encodeNames(self::DEFAULT_SECOND_NAMES));
        $db->exec("INSERT INTO song_image_groups (LISTID, NAME, NAMES, SORT_ORDER, IS_MAIN) VALUES ({$listId}, '{$main}', '{$mainN}', 1, 1)");
        $db->exec("INSERT INTO song_image_groups (LISTID, NAME, NAMES, SORT_ORDER, IS_MAIN) VALUES ({$listId}, '{$second}', '{$secondN}', 2, 0)");
    }

    private static function load($listId)
    {
        return Info::get('db')->select(
            "SELECT ID, LISTID, NAME, NAMES, SORT_ORDER, IS_MAIN
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

    /** Absolute directory of a group's image files. */
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

    /** Regex matching the song's file in a group directory (current + legacy "_1" name). */
    private static function fileRegex($num)
    {
        return '/^' . preg_quote($num, '/') . '(?:_1)?\.(' . self::EXT_PATTERN . ')$/i';
    }

    /**
     * Absolute paths of the files holding the song's image in a group —
     * normally 0 or 1 (more only when both extensions / the legacy name
     * exist; "<NUM>.ext" sorts first and wins).
     */
    public static function slotFiles($listId, array $group, $num)
    {
        $listId = (int)$listId;
        if (!self::isSafeNum($num)) {
            return [];
        }
        if ((int)$group['IS_MAIN'] === 1) {
            $f = self::listDir($listId) . '/' . $num . '.jpg';
            return is_file($f) ? [$f] : [];
        }
        $dir = self::groupDir($listId, $group['ID']);
        $out = [];
        if (is_dir($dir)) {
            $re = self::fileRegex($num);
            foreach (scandir($dir) as $f) {
                if (preg_match($re, $f) && is_file($dir . '/' . $f)) {
                    $out[] = $dir . '/' . $f;
                }
            }
            sort($out);
        }
        return $out;
    }

    /** Web path of the song's image in a group, or null when it has none. */
    public static function songImage($listId, array $group, $num)
    {
        $files = self::slotFiles($listId, $group, $num);
        if (!$files) {
            return null;
        }
        if ((int)$group['IS_MAIN'] === 1) {
            return self::mainImageUrl($listId, $num);
        }
        $dir = self::groupDir($listId, $group['ID']);
        return self::groupUrl($listId, $group['ID']) . '/' . substr($files[0], strlen($dir) + 1);
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
                if (preg_match('/\.(' . self::EXT_PATTERN . ')$/i', $f) && is_file($dir . '/' . $f)) {
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
     * Map an archive entry to a (song number, extension) pair; the file name
     * stem IS the song number ("x/y/д001.JPG" → num "д001", ext "jpg" —
     * directories inside the ZIP are ignored).
     *
     * Returns null for directories / hidden files, ['error' => 'notImage'] for
     * other extensions, otherwise ['name', 'num', 'ext', 'known'] where known
     * tells whether the collection has a song with that number ($numSet =
     * [NUM => true, ...]). Unknown numbers are still returned: images may be
     * imported before the song texts, exactly as the old import allowed.
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
        if (($ext !== 'jpg' && $ext !== 'png') || $stem === '') {
            return ['name' => $name, 'error' => 'notImage'];
        }
        return ['name' => $name, 'num' => $stem, 'ext' => $ext, 'known' => isset($numSet[$stem])];
    }

    /**
     * Where the song's image in a group lives: [absolute path, web path].
     * The main group's image is the legacy root file (always ".jpg").
     */
    public static function target($listId, array $group, $num, $ext)
    {
        if ((int)$group['IS_MAIN'] === 1) {
            return [self::listDir($listId) . '/' . $num . '.jpg', self::mainImageUrl($listId, $num)];
        }
        $file = $num . '.' . $ext;
        return [
            self::groupDir($listId, $group['ID']) . '/' . $file,
            self::groupUrl($listId, $group['ID']) . '/' . $file,
        ];
    }

    /** Remove a group's directory with all its image files (main sheets are never touched). */
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
