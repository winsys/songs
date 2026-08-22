<?php

/**
 * Import page Ajax methods
 * Handles song list creation, SOG imports, language management
 */
trait Ajax_Import
{
    // --------------------------------------------------------
    // Create a new song book
    // Params: name
    // --------------------------------------------------------
    private static function create_song_list()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }

        $dbh = Info::get('dbh');
        $name = mysqli_real_escape_string($dbh, trim(self::$args['name'] ?? ''));

        if ($name === '') {
            return json_encode(['status' => 'error', 'message' => T::s('import.error.nameEmpty')]);
        }

        // Get the next LIST_ID
        $row = Info::get('db')->get("SELECT MAX(LIST_ID) AS max_id FROM list_names");
        $nextId = ($row && $row['max_id']) ? (int)$row['max_id'] + 1 : 1;

        $userId = (int)$_SESSION['curGroupId'];
        Info::get('db')->exec(
            "INSERT INTO list_names (LIST_ID, LIST_NAME, ADDEDBY) VALUES ({$nextId}, '{$name}', {$userId})"
        );
        // Every collection starts with the default image groups (НОТЫ + АККОРДЫ).
        SongImages::ensureDefaults($nextId);

        return json_encode(['status' => 'success', 'list_id' => $nextId]);
    }

    // --------------------------------------------------------
    // Import song lyrics in SOG format
    // POST file: sogfile
    // POST fields: list_id, lang (ru|lt|en)
    // --------------------------------------------------------
    private static function import_songs_sog()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }

        if (!isset($_FILES['sogfile']) || $_FILES['sogfile']['error'] !== UPLOAD_ERR_OK) {
            $errCode = isset($_FILES['sogfile']) ? $_FILES['sogfile']['error'] : 'no file';
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.fileNotUploaded', ['code' => $errCode])]);
        }

        $listId = (int)($_POST['list_id'] ?? 0);
        $lang = trim($_POST['lang'] ?? 'ru');

        $db = Info::get('db');
        $dbh = Info::get('dbh');
        $langRow = $db->get("SELECT col_suffix FROM languages WHERE code = '" . mysqli_real_escape_string($dbh, $lang) . "'");
        if (!$langRow) {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.invalidLang')]);
        }
        if ($listId <= 0) {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.noCollection')]);
        }

        $field = 'TEXT' . $langRow['col_suffix'];

        // Read file, strip UTF-8 BOM if present
        $raw = file_get_contents($_FILES['sogfile']['tmp_name']);
        $raw = ltrim($raw, "\xEF\xBB\xBF"); // UTF-8 BOM
        $raw = str_replace("\r\n", "\n", $raw);
        $raw = str_replace("\r", "\n", $raw);
        $lines = explode("\n", $raw);

        $log = [];
        $updated = 0;
        $errors = 0;

        $i = 0;
        $total = count($lines);

        while ($i < $total) {
            // Skip empty lines between songs
            if (trim($lines[$i]) === '') {
                $i++;
                continue;
            }

            // Line 1: song number
            $num = trim($lines[$i]);
            $i++;
            if ($i >= $total) break;

            // Line 2: song name
            $name = trim($lines[$i]);
            $i++;

            // Lines 3+: verses until an empty line
            $verses = [];
            while ($i < $total && trim($lines[$i]) !== '') {
                $verses[] = $lines[$i];
                $i++;
            }
            $text = implode("\r\n", $verses);

            if ($num === '') {
                $log[] = ['type' => 'warn', 'msg' => T::s('import.log.skippedSongNumber', ['line' => $i])];
                $errors++;
                continue;
            }

            // Look up the song in the database
            $numEsc = mysqli_real_escape_string($dbh, $num);
            $nameEsc = mysqli_real_escape_string($dbh, $name);
            $textEsc = mysqli_real_escape_string($dbh, $text);

            $existing = $db->get(
                "SELECT ID FROM song_list WHERE LISTID={$listId} AND NUM='{$numEsc}' LIMIT 1"
            );

            if ($existing) {
                $db->exec(
                    "UPDATE song_list SET {$field}='{$textEsc}', NAME=IF(NAME='', '{$nameEsc}', NAME)
                     WHERE ID={$existing['ID']}"
                );
                $log[] = ['type' => 'ok', 'msg' => T::s('import.log.songUpdated', ['num' => $num, 'name' => $name])];
            } else {
                // Create a new record
                $nameField = $lang === 'ru' ? "NAME='{$nameEsc}', TEXT='{$textEsc}'"
                    : "NAME='{$nameEsc}', {$field}='{$textEsc}'";
                $db->exec(
                    "INSERT INTO song_list (LISTID, NUM, NAME, {$field})
                     VALUES ({$listId}, '{$numEsc}', '{$nameEsc}', '{$textEsc}')"
                );
                $log[] = ['type' => 'ok', 'msg' => T::s('import.log.songAdded', ['num' => $num, 'name' => $name])];
            }
            $updated++;
        }

        return json_encode([
            'status' => 'success',
            'updated' => $updated,
            'errors' => $errors,
            'log' => $log,
        ]);
    }

    // --------------------------------------------------------
    // Import song book images from a ZIP archive into an image group
    // POST file: zipfile
    // POST fields: list_id,
    //              group_id (default: the collection's main group),
    //              mode = 'replace' (overwrite files of the same page slot,
    //                     default — the legacy behaviour) | 'add' (keep
    //                     existing files, import only missing ones)
    // Entry names are song numbers (<NUM>.jpg|png, see
    // SongImages::parseEntryName); a song has ONE image per group. The main
    // group's image is the legacy /images/<list>/<NUM>.jpg; every other group
    // stores g<GROUP_ID>/<NUM>.<ext>.
    // Works without the zip extension (ZipReader fallback).
    // --------------------------------------------------------
    private static function import_song_images_zip()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }

        if (!isset($_FILES['zipfile']) || $_FILES['zipfile']['error'] !== UPLOAD_ERR_OK) {
            $errCode = isset($_FILES['zipfile']) ? $_FILES['zipfile']['error'] : 'no file';
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.fileNotUploaded', ['code' => $errCode])]);
        }

        $listId = (int)($_POST['list_id'] ?? 0);
        if ($listId <= 0) {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.noCollection')]);
        }

        $db     = Info::get('db');
        $groups = SongImages::groups($listId);
        if (!$groups) {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.groupsTableMissing')]);
        }
        $groupId = (int)($_POST['group_id'] ?? 0);
        $group   = null;
        if ($groupId > 0) {
            foreach ($groups as $g) {
                if ((int)$g['ID'] === $groupId) {
                    $group = $g;
                }
            }
            if (!$group) {
                return json_encode(['status' => 'error', 'message' => T::s('ajax.error.groupNotFound')]);
            }
        } else {
            $group = SongImages::mainGroup($groups);
        }
        $mode = (($_POST['mode'] ?? 'replace') === 'add') ? 'add' : 'replace';

        $openError = '';
        $zip = self::openImageZip($_FILES['zipfile']['tmp_name'], $openError);
        if (!$zip) {
            return json_encode(['status' => 'error', 'message' => $openError]);
        }

        $listDir = SongImages::listDir($listId);
        if (!is_dir($listDir) && !@mkdir($listDir, 0777, true) && !is_dir($listDir)) {
            $zip->close();
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.dirCreateFailed', ['dir' => '/images/' . $listId])]);
        }

        // Known song numbers of the collection: they tell "503_2" (page 2 of
        // song 503) from a song actually numbered "503_2".
        $numSet = [];
        foreach ($db->select("SELECT NUM FROM song_list WHERE LISTID = {$listId}") as $r) {
            $numSet[(string)$r['NUM']] = true;
        }

        $extracted = 0;
        $skipped   = 0;
        $errors    = 0;
        $log       = [];

        // Raw entry names: ZipArchive would otherwise re-encode non-UTF-8
        // names as CP437 (a Windows-zipped "д001.jpg" becomes "ñ001.jpg");
        // SongImages::decodeName() handles the DOS-Cyrillic case itself.
        $nameFlags = ($zip instanceof ZipArchive) ? ZipArchive::FL_ENC_RAW : 0;

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $p = SongImages::parseEntryName($zip->getNameIndex($i, $nameFlags), $numSet);
            if ($p === null) {
                continue; // directory or hidden file
            }
            if (isset($p['error'])) {
                $log[] = ['type' => 'warn', 'msg' => T::s('import.log.skippedNotImage', ['name' => $p['name']])];
                continue;
            }
            if (!SongImages::isSafeNum($p['num'])) {
                $log[] = ['type' => 'error', 'msg' => T::s('import.log.badFileName', ['name' => $p['name']])];
                $errors++;
                continue;
            }
            list($abs) = SongImages::target($listId, $group, $p['num'], $p['ext']);
            $shown    = substr($abs, strlen($listDir) + 1); // "001.jpg" or "g3/001.png"
            $existing = SongImages::slotFiles($listId, $group, $p['num']);

            if ($mode === 'add' && $existing) {
                $log[] = ['type' => 'ok', 'msg' => T::s('import.log.skippedExists', ['name' => $shown])];
                $skipped++;
                continue;
            }

            $content = $zip->getFromIndex($i);
            if ($content === false || $content === '') {
                $log[] = ['type' => 'error', 'msg' => T::s('import.log.zipReadError', ['name' => $p['name']])];
                $errors++;
                continue;
            }
            // Real JPEG/PNG content only, whatever the extension says.
            $info = @getimagesizefromstring($content);
            if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG], true)) {
                $log[] = ['type' => 'warn', 'msg' => T::s('import.log.invalidImage', ['name' => $p['name']])];
                $errors++;
                continue;
            }

            // Images may be imported before the song texts: an unknown number
            // is still saved (as page 1), but flagged.
            if (!$p['known']) {
                $log[] = ['type' => 'warn', 'msg' => T::s('import.log.noSongForImage', ['num' => $p['num'], 'name' => $p['name']])];
            }

            $dir = dirname($abs);
            if (!is_dir($dir) && !@mkdir($dir, 0777, true) && !is_dir($dir)) {
                $log[] = ['type' => 'error', 'msg' => T::s('import.log.fileWriteError', ['name' => $shown])];
                $errors++;
                continue;
            }
            // Replace mode: the slot may hold the other extension (001.png vs
            // 001.jpg) or the legacy "001_1" name — one file per song and group.
            foreach ($existing as $old) {
                if ($old !== $abs) {
                    @unlink($old);
                }
            }
            if (@file_put_contents($abs, $content) === false) {
                $log[] = ['type' => 'error', 'msg' => T::s('import.log.fileWriteError', ['name' => $shown])];
                $errors++;
                continue;
            }
            @chmod($abs, 0664);

            $log[] = ['type' => 'ok', 'msg' => T::s('import.log.imageSaved', ['name' => $shown])];
            $extracted++;
        }

        $zip->close();

        // Musicians of the importer's group looking at this collection re-pull
        // their notes (new pages appear, changed files get a fresh buster).
        if ($extracted > 0) {
            $own   = (int)$_SESSION['curGroupId'];
            $notes = $db->get("SELECT image FROM current_notes WHERE groupId = {$own}");
            if ($notes && strpos((string)$notes['image'], '/images/' . $listId . '/') === 0) {
                self::broadcastToGroup($own, ['type' => 'notes_update']);
            }
        }

        return json_encode([
            'status'    => 'success',
            'extracted' => $extracted,
            'skipped'   => $skipped,
            'errors'    => $errors,
            'log'       => $log,
            'group'     => ['id' => (int)$group['ID'], 'name' => $group['NAME']],
        ]);
    }

    /** ZipArchive when the extension is available, otherwise the pure-PHP reader. */
    private static function openImageZip($path, &$error)
    {
        $zip = class_exists('ZipArchive') ? new ZipArchive() : new ZipReader();
        $res = $zip->open($path);
        if ($res === true) {
            return $zip;
        }
        $error = T::s('ajax.error.zipOpenFailed', ['code' => $res]);
        return null;
    }

    // ============================================================
    // SHEET-MUSIC IMAGE GROUPS (per collection) — see app/SongImages.php
    // ============================================================

    // --------------------------------------------------------
    // Groups of a collection with image counts (any logged-in user).
    // Params: list_id
    // --------------------------------------------------------
    private static function get_image_groups()
    {
        $listId = (int)(self::$args['list_id'] ?? 0);
        $out = [];
        foreach (SongImages::groups($listId) as $g) {
            $out[] = self::imageGroupRow($listId, $g);
        }
        return json_encode($out);
    }

    private static function imageGroupRow($listId, array $g)
    {
        return [
            'ID'           => (int)$g['ID'],
            'LISTID'       => (int)$g['LISTID'],
            'NAME'         => $g['NAME'],                          // original (as created)
            'NAMES'        => (object)SongImages::names($g),       // {ui_lang: translation}
            'display_name' => SongImages::displayName($g),         // in the caller's UI language
            'SORT_ORDER'   => (int)$g['SORT_ORDER'],
            'IS_MAIN'      => (int)$g['IS_MAIN'],
            'image_count'  => SongImages::countImages($listId, $g),
        ];
    }

    // --------------------------------------------------------
    // Store the translations of a group name (admin).
    // Params: id, names = {ru, de, en, lt} (empty = use the original NAME)
    // --------------------------------------------------------
    private static function set_image_group_names()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }
        $id = (int)(self::$args['id'] ?? 0);
        $g  = SongImages::group($id);
        if (!$g) {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.groupNotFound')]);
        }
        $json = SongImages::encodeNames(self::$args['names'] ?? null);
        $sql  = $json === null ? 'NULL' : "'" . mysqli_real_escape_string(Info::get('dbh'), $json) . "'";
        Info::get('db')->exec("UPDATE song_image_groups SET NAMES = {$sql} WHERE ID = {$id}");
        $g['NAMES'] = $json;
        return json_encode(['status' => 'success', 'group' => self::imageGroupRow((int)$g['LISTID'], $g)]);
    }

    /**
     * Normalize + validate a group name within a collection.
     * Returns [name, null] or [null, error message].
     */
    private static function validImageGroupName($name, $listId, $exceptId = 0)
    {
        $name = trim((string)preg_replace('/\s+/u', ' ', (string)$name));
        if ($name === '') {
            return [null, T::s('ajax.error.groupNameEmpty')];
        }
        if (mb_strlen($name, 'UTF-8') > 100) {
            $name = mb_substr($name, 0, 100, 'UTF-8');
        }
        $lower = mb_strtolower($name, 'UTF-8');
        foreach (SongImages::groups($listId) as $g) {
            if ((int)$g['ID'] !== (int)$exceptId && mb_strtolower($g['NAME'], 'UTF-8') === $lower) {
                return [null, T::s('ajax.error.groupExists')];
            }
        }
        return [$name, null];
    }

    // --------------------------------------------------------
    // Add a group to a collection (admin). Params: list_id, name
    // --------------------------------------------------------
    private static function add_image_group()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }
        $db     = Info::get('db');
        $dbh    = Info::get('dbh');
        $listId = (int)(self::$args['list_id'] ?? 0);
        if ($listId <= 0 || !$db->get("SELECT LIST_ID FROM list_names WHERE LIST_ID = {$listId}")) {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.noCollection')]);
        }
        $groups = SongImages::groups($listId);
        if (!$groups) {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.groupsTableMissing')]);
        }
        list($name, $err) = self::validImageGroupName(self::$args['name'] ?? '', $listId);
        if ($err !== null) {
            return json_encode(['status' => 'error', 'message' => $err]);
        }
        $order = 0;
        foreach ($groups as $g) {
            $order = max($order, (int)$g['SORT_ORDER']);
        }
        $db->exec(
            "INSERT INTO song_image_groups (LISTID, NAME, SORT_ORDER, IS_MAIN)
             VALUES ({$listId}, '" . mysqli_real_escape_string($dbh, $name) . "', " . ($order + 1) . ", 0)"
        );
        $g = SongImages::group((int)$db->insert_id());
        if (!$g) {
            return json_encode(['status' => 'error', 'message' => T::s('import.log.serverError')]);
        }
        return json_encode(['status' => 'success', 'group' => self::imageGroupRow($listId, $g)]);
    }

    // --------------------------------------------------------
    // Rename a group (admin). Params: id, name
    // --------------------------------------------------------
    private static function rename_image_group()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }
        $id = (int)(self::$args['id'] ?? 0);
        $g  = SongImages::group($id);
        if (!$g) {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.groupNotFound')]);
        }
        list($name, $err) = self::validImageGroupName(self::$args['name'] ?? '', (int)$g['LISTID'], $id);
        if ($err !== null) {
            return json_encode(['status' => 'error', 'message' => $err]);
        }
        Info::get('db')->exec(
            "UPDATE song_image_groups SET NAME = '" . mysqli_real_escape_string(Info::get('dbh'), $name) . "' WHERE ID = {$id}"
        );
        $g['NAME'] = $name;
        return json_encode(['status' => 'success', 'group' => self::imageGroupRow((int)$g['LISTID'], $g)]);
    }

    // --------------------------------------------------------
    // Delete a group with all its page files (admin). Params: id
    // The main group (legacy sheets) cannot be deleted.
    // --------------------------------------------------------
    private static function delete_image_group()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }
        $id = (int)(self::$args['id'] ?? 0);
        $g  = SongImages::group($id);
        if (!$g) {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.groupNotFound')]);
        }
        if ((int)$g['IS_MAIN'] === 1) {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.groupMainDelete')]);
        }
        Info::get('db')->exec("DELETE FROM song_image_groups WHERE ID = {$id}");
        SongImages::deleteGroupFiles((int)$g['LISTID'], $id);
        // Musicians of the admin's own group re-resolve their selection.
        self::broadcastToGroup((int)$_SESSION['curGroupId'], ['type' => 'notes_update']);
        return json_encode(['status' => 'success']);
    }

    // --------------------------------------------------------
    // Reorder the groups of a collection (admin). Params: list_id, ids[]
    // ids must contain every group of the collection exactly once.
    // --------------------------------------------------------
    private static function reorder_image_groups()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }
        $listId = (int)(self::$args['list_id'] ?? 0);
        $ids    = is_array(self::$args['ids'] ?? null) ? array_map('intval', self::$args['ids']) : [];
        $groups = SongImages::groups($listId);
        $known  = [];
        foreach ($groups as $g) {
            $known[(int)$g['ID']] = true;
        }
        if (!$groups || count($ids) !== count($groups) || count(array_unique($ids)) !== count($ids)) {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.groupNotFound')]);
        }
        foreach ($ids as $id) {
            if (!isset($known[$id])) {
                return json_encode(['status' => 'error', 'message' => T::s('ajax.error.groupNotFound')]);
            }
        }
        foreach ($ids as $i => $id) {
            Info::get('db')->exec("UPDATE song_image_groups SET SORT_ORDER = " . ($i + 1) . " WHERE ID = {$id} AND LISTID = {$listId}");
        }
        return json_encode(['status' => 'success']);
    }

    // ─── Per-song page images (tech edit dialog) ───────────────────

    /** Roles that may add / delete page images (= who can open the tech page). */
    private static function canEditSongImages()
    {
        return in_array(Security::getRole(), ['admin', 'leader', 'tech'], true);
    }

    /** Groups of the song's collection with the song's image in each: [{id, name, orig_name, is_main, image|null}]. */
    private static function songImageGroups(array $song)
    {
        $listId = (int)$song['LISTID'];
        $out    = [];
        foreach (SongImages::groups($listId) as $g) {
            $out[] = [
                'id'        => (int)$g['ID'],
                'name'      => SongImages::displayName($g),   // in the caller's UI language
                'orig_name' => $g['NAME'],
                'is_main'   => (int)$g['IS_MAIN'],
                'image'     => SongImages::songImage($listId, $g, $song['NUM']),
            ];
        }
        return $out;
    }

    /** Musicians of the caller's group re-pull their notes when the song is the one on their screen. */
    private static function notifyNotesIfCurrent($listId, $num)
    {
        $own   = (int)$_SESSION['curGroupId'];
        $notes = Info::get('db')->get("SELECT image FROM current_notes WHERE groupId = {$own}");
        if ($notes && (string)$notes['image'] === SongImages::mainImageUrl($listId, $num)) {
            self::broadcastToGroup($own, ['type' => 'notes_update']);
        }
    }

    // --------------------------------------------------------
    // All page images of one song, per group of its collection.
    // Params: song_id
    // --------------------------------------------------------
    private static function get_song_images()
    {
        $songId = (int)(self::$args['song_id'] ?? 0);
        $song   = Info::get('db')->get("SELECT ID, LISTID, NUM FROM song_list WHERE ID = {$songId}");
        if (!$song) {
            return json_encode(['status' => 'error', 'message' => 'Song not found']);
        }
        return json_encode([
            'status'  => 'success',
            'list_id' => (int)$song['LISTID'],
            'num'     => $song['NUM'],
            'groups'  => self::songImageGroups($song),
        ]);
    }

    // --------------------------------------------------------
    // Upload / replace the song's image in a group (multipart).
    // POST: song_id, group_id, image. The main group's image is the legacy
    // <NUM>.jpg (exactly like upload_song_image); other groups store
    // g<GROUP_ID>/<NUM>.<jpg|png>. An existing image of the slot (other
    // extension / legacy "_1" name) is removed.
    // --------------------------------------------------------
    private static function upload_song_group_image()
    {
        if (!self::canEditSongImages()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }
        $songId  = (int)($_POST['song_id'] ?? 0);
        $groupId = (int)($_POST['group_id'] ?? 0);
        $song    = Info::get('db')->get("SELECT ID, LISTID, NUM FROM song_list WHERE ID = {$songId}");
        if (!$song) {
            return json_encode(['status' => 'error', 'message' => 'Song not found']);
        }
        $listId = (int)$song['LISTID'];
        $num    = (string)$song['NUM'];
        $group  = SongImages::group($groupId);
        if (!$group || (int)$group['LISTID'] !== $listId) {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.groupNotFound')]);
        }
        if (!SongImages::isSafeNum($num)) {
            return json_encode(['status' => 'error', 'message' => T::s('import.log.badFileName', ['name' => $num])]);
        }
        if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
            return json_encode(['status' => 'error', 'message' => 'Upload error']);
        }
        $ext = strtolower(pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['jpg', 'jpeg', 'png'], true)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid extension: ' . $ext]);
        }
        if (!self::checkMime($_FILES['image']['tmp_name'], ['image/jpeg', 'image/png'])) {
            return json_encode(['status' => 'error', 'message' => 'Invalid file type (MIME mismatch)']);
        }
        $ext = ($ext === 'png') ? 'png' : 'jpg';

        list($abs, $url) = SongImages::target($listId, $group, $num, $ext);
        $dir = dirname($abs);
        if (!is_dir($dir) && !@mkdir($dir, 0777, true) && !is_dir($dir)) {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.dirCreateFailed', ['dir' => dirname($url)])]);
        }
        foreach (SongImages::slotFiles($listId, $group, $num) as $old) {
            if ($old !== $abs) {
                @unlink($old);
            }
        }
        $tmp = $_FILES['image']['tmp_name'];
        // move_uploaded_file() for real uploads; plain copy only in CLI (tests).
        $ok = is_uploaded_file($tmp) ? move_uploaded_file($tmp, $abs) : (PHP_SAPI === 'cli' && copy($tmp, $abs));
        if (!$ok) {
            return json_encode(['status' => 'error', 'message' => 'Failed to move uploaded file. Check write permissions on: ' . $dir]);
        }
        @chmod($abs, 0664);
        self::notifyNotesIfCurrent($listId, $num);
        return json_encode([
            'status' => 'success',
            'path'   => $url,
            'groups' => self::songImageGroups($song),
        ]);
    }

    // --------------------------------------------------------
    // Delete the song's image in a group. Params: song_id, group_id
    // --------------------------------------------------------
    private static function delete_song_group_image()
    {
        if (!self::canEditSongImages()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }
        $songId  = (int)(self::$args['song_id'] ?? 0);
        $groupId = (int)(self::$args['group_id'] ?? 0);
        $song    = Info::get('db')->get("SELECT ID, LISTID, NUM FROM song_list WHERE ID = {$songId}");
        if (!$song) {
            return json_encode(['status' => 'error', 'message' => 'Song not found']);
        }
        $listId = (int)$song['LISTID'];
        $num    = (string)$song['NUM'];
        $group  = SongImages::group($groupId);
        if (!$group || (int)$group['LISTID'] !== $listId || !SongImages::isSafeNum($num)) {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.groupNotFound')]);
        }
        foreach (SongImages::slotFiles($listId, $group, $num) as $f) {
            @unlink($f);
        }
        self::notifyNotesIfCurrent($listId, $num);
        return json_encode(['status' => 'success', 'groups' => self::songImageGroups($song)]);
    }

    // --------------------------------------------------------
    // Import messages in SOG format
    // POST file: sogfile
    // POST fields: lang (ru|lt|en)
    // --------------------------------------------------------
    private static function import_messages_sog()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }

        if (!isset($_FILES['sogfile']) || $_FILES['sogfile']['error'] !== UPLOAD_ERR_OK) {
            $errCode = isset($_FILES['sogfile']) ? $_FILES['sogfile']['error'] : 'no file';
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.fileNotUploaded', ['code' => $errCode])]);
        }

        $lang = trim($_POST['lang'] ?? 'ru');
        $dbh = Info::get('dbh');
        $db = Info::get('db');
        $langRow = $db->get("SELECT col_suffix FROM languages WHERE code = '" . mysqli_real_escape_string($dbh, $lang) . "'");
        if (!$langRow) {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.invalidLang')]);
        }

        $textField = 'TEXT' . $langRow['col_suffix'];

        // Read file, strip UTF-8 BOM
        $raw = file_get_contents($_FILES['sogfile']['tmp_name']);
        $raw = ltrim($raw, "\xEF\xBB\xBF"); // UTF-8 BOM

        // Normalize line endings (CR+LF → LF)
        $raw = str_replace("\r\n", "\n", $raw);
        $raw = str_replace("\r", "\n", $raw);
        $lines = explode("\n", $raw);

        $userId = (int)$_SESSION['curGroupId'];
        $log = [];
        $inserted = 0;
        $updated = 0;
        $errors = 0;

        $i = 0;
        $total = count($lines);

        while ($i < $total) {
            // ── Step 1: first line (ignored) ──────────────────
            // Skip empty lines between blocks
            if (trim($lines[$i]) === '') {
                $i++;
                continue;
            }
            $i++; // skip the header line

            if ($i >= $total) break;

            // ── Step 2: line with code, title, and city ───────
            $headerLine = $lines[$i];
            $i++;

            // CODE — from the start up to the first space
            if (!preg_match('/^(\S+)\s*/', $headerLine, $m)) {
                $log[] = ['type' => 'warn', 'msg' => T::s('import.log.parseHeaderFailed', ['line' => $i, 'header' => $headerLine])];
                $errors++;
                // Skip ahead to the next blank line
                while ($i < $total && trim($lines[$i]) !== '') $i++;
                continue;
            }
            $code = $m[1];
            $rest = substr($headerLine, strlen($m[0]));

            // Strip leading spaces and dashes
            $rest = ltrim($rest, " \t-–—");

            // TITLE — up to the "(" character
            $parenPos = strpos($rest, '(');
            if ($parenPos !== false) {
                $title = rtrim(substr($rest, 0, $parenPos), " \t(");
                // CITY — between parentheses
                $closePos = strpos($rest, ')', $parenPos);
                $city = $closePos !== false
                    ? trim(substr($rest, $parenPos + 1, $closePos - $parenPos - 1))
                    : '';
            } else {
                $title = trim($rest);
                $city = '';
            }

            if ($code === '') {
                $log[] = ['type' => 'warn', 'msg' => T::s('import.log.skippedEmptyCode', ['line' => $i])];
                $errors++;
                while ($i < $total && trim($lines[$i]) !== '') $i++;
                continue;
            }

            // ── Step 3: text paragraphs until an empty line ──
            $paragraphs = [];
            while ($i < $total) {
                $line = $lines[$i];
                // Empty or whitespace-only line — end of message
                if (trim($line) === '') {
                    $i++;
                    break;
                }
                $paragraphs[] = $line;
                $i++;
            }
            $text = implode("\r\n", $paragraphs);

            // Save to database
            $codeEsc = mysqli_real_escape_string($dbh, $code);
            $titleEsc = mysqli_real_escape_string($dbh, $title);
            $cityEsc = mysqli_real_escape_string($dbh, $city);
            $textEsc = mysqli_real_escape_string($dbh, $text);

            $existing = $db->get(
                "SELECT ID FROM messages WHERE CODE='{$codeEsc}' LIMIT 1"
            );

            if ($existing) {
                // Update text for the target language (and for ru — also TITLE/CITY if empty)
                if ($lang === 'ru') {
                    $db->exec(
                        "UPDATE messages SET
                            TEXT='{$textEsc}',
                            TITLE=IF(TITLE='', '{$titleEsc}', TITLE),
                            CITY=IF(CITY='', '{$cityEsc}', CITY)
                         WHERE ID={$existing['ID']}"
                    );
                } else {
                    $db->exec(
                        "UPDATE messages SET {$textField}='{$textEsc}' WHERE ID={$existing['ID']}"
                    );
                }
                $log[] = ['type' => 'ok', 'msg' => T::s('import.success.msgUpdated', ['code' => $code, 'title' => $title])];
                $updated++;
            } else {
                // New record: the imported text goes into the selected language
                // column, all other language columns start empty.
                $insCols = [];
                $insVals = [];
                foreach (self::getLanguages() as $lg) {
                    $col       = 'TEXT' . $lg['col_suffix'];
                    $insCols[] = $col;
                    $insVals[] = ($col === $textField) ? "'{$textEsc}'" : "''";
                }
                $db->exec(
                    "INSERT INTO messages (USER_ID, CODE, TITLE, CITY, " . implode(', ', $insCols) . ")
                     VALUES ({$userId}, '{$codeEsc}', '{$titleEsc}', '{$cityEsc}', " . implode(', ', $insVals) . ")"
                );
                $log[] = ['type' => 'ok', 'msg' => T::s('import.success.msgInsertedCity', ['code' => $code, 'title' => $title, 'city' => $city])];
                $inserted++;
            }
        }

        return json_encode([
            'status' => 'success',
            'inserted' => $inserted,
            'updated' => $updated,
            'errors' => $errors,
            'log' => $log,
        ]);
    }

    // --------------------------------------------------------
    // Import a message entered as plain text
    // POST fields: lang, code, title, city, para_sep, body
    // --------------------------------------------------------
    private static function import_messages_text()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }

        $lang     = trim(self::$args['lang']      ?? 'ru');
        $code     = trim(self::$args['code']      ?? '');
        $title    = trim(self::$args['title']     ?? '');
        $city     = trim(self::$args['city']      ?? '');
        $paraSep  = trim(self::$args['para_sep']  ?? 'emptyline');
        $body     = self::$args['body']           ?? '';
        $audioSrc = trim(self::$args['audio_src'] ?? '');
        // Normalize timecodes: convert to \r\n, remove empty lines
        $timecodesRaw = self::$args['timecodes'] ?? '';
        $timecodesRaw = str_replace("\r\n", "\n", $timecodesRaw);
        $timecodesRaw = str_replace("\r", "\n",   $timecodesRaw);
        $tcLines = array_filter(array_map('trim', explode("\n", $timecodesRaw)), function($l) { return $l !== ''; });
        $timecodes = implode("\r\n", $tcLines);

        $dbh  = Info::get('dbh');
        $db   = Info::get('db');
        $langRow = $db->get("SELECT col_suffix FROM languages WHERE code = '" . mysqli_real_escape_string($dbh, $lang) . "'");
        if (!$langRow) {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.invalidLang')]);
        }

        $mode    = trim(self::$args['mode'] ?? 'new');

        if ($code === '') {
            return json_encode(['status' => 'error', 'message' => T::s('import.error.codeEmpty')]);
        }
        if ($mode === 'new' && $title === '') {
            return json_encode(['status' => 'error', 'message' => T::s('import.error.nameEmpty')]);
        }
        if (trim($body) === '') {
            return json_encode(['status' => 'error', 'message' => T::s('import.error.bodyEmpty')]);
        }

        // Validate code format: YY-MMDD[x][x]
        if (!preg_match('/^\d{2}-\d{4}[A-Za-z]{0,2}$/', $code)) {
            return json_encode(['status' => 'error', 'message' => T::s('import.error.invalidCodeFormat')]);
        }

        // Normalize line endings
        $body = str_replace("\r\n", "\n", $body);
        $body = str_replace("\r", "\n", $body);

        // Split into paragraphs
        if ($paraSep === 'emptyline') {
            // Separator is an empty line; multiple consecutive empty lines count as one
            $blocks = preg_split('/\n{2,}/', trim($body));
        } else {
            // Each non-empty line is a separate paragraph
            $blocks = explode("\n", $body);
        }

        // Within each paragraph, collapse remaining newlines to a space
        $blocks = array_map(function ($b) {
            return trim(preg_replace('/[\r\n]+/', ' ', $b));
        }, $blocks);

        // Remove empty blocks and extra whitespace
        $paragraphs = array_filter(array_map('trim', $blocks), function ($b) { return $b !== ''; });
        $text = implode("\r\n", $paragraphs);

        // Validate that paragraph and timecode counts match
        $tcCount   = count($tcLines);
        $paraCount = count($paragraphs);
        $tcWarning = '';
        if ($tcCount > 0 && $tcCount !== $paraCount) {
            $tcWarning = T::s('import.warn.timecodeMismatch', ['tc' => $tcCount, 'paragraphs' => $paraCount]);
        }

        $userId = (int)$_SESSION['curGroupId'];

        $textField = 'TEXT' . $langRow['col_suffix'];

        $codeEsc       = mysqli_real_escape_string($dbh, $code);
        $titleEsc      = mysqli_real_escape_string($dbh, $title);
        $cityEsc       = mysqli_real_escape_string($dbh, $city);
        $textEsc       = mysqli_real_escape_string($dbh, $text);
        $audioSrcEsc   = mysqli_real_escape_string($dbh, $audioSrc);
        $timecodesEsc  = mysqli_real_escape_string($dbh, $timecodes);

        $existing = $db->get("SELECT ID FROM messages WHERE CODE='{$codeEsc}' LIMIT 1");

        if (in_array($mode, ['translate', 'edit']) && !$existing) {
            return json_encode(['status' => 'error', 'message' => T::s('import.error.msgNotFoundCreateFirst', ['code' => $codeEsc])]);
        }

        if ($existing) {
            if ($mode === 'edit') {
                // Edit mode: overwrite all fields
                $db->exec(
                    "UPDATE messages SET
                        TITLE='{$titleEsc}',
                        CITY='{$cityEsc}',
                        {$textField}='{$textEsc}',
                        AUDIO_SRC='{$audioSrcEsc}',
                        TIMECODES=" . ($timecodesEsc !== '' ? "'{$timecodesEsc}'" : 'NULL')
                    . " WHERE ID={$existing['ID']}"
                );
            } elseif ($lang === 'ru') {
                $db->exec(
                    "UPDATE messages SET
                        TEXT='{$textEsc}',
                        TITLE=IF(TITLE='', '{$titleEsc}', TITLE),
                        CITY=IF(CITY='', '{$cityEsc}', CITY)"
                    . ($audioSrcEsc  !== '' ? ", AUDIO_SRC='{$audioSrcEsc}'"  : '')
                    . ($timecodesEsc !== '' ? ", TIMECODES='{$timecodesEsc}'" : '')
                    . " WHERE ID={$existing['ID']}"
                );
            } else {
                $db->exec(
                    "UPDATE messages SET {$textField}='{$textEsc}'"
                    . ($audioSrcEsc  !== '' ? ", AUDIO_SRC='{$audioSrcEsc}'"  : '')
                    . ($timecodesEsc !== '' ? ", TIMECODES='{$timecodesEsc}'" : '')
                    . " WHERE ID={$existing['ID']}"
                );
            }
            return json_encode([
                'status'   => 'success',
                'action'   => 'updated',
                'message'  => ($city ? T::s('import.success.msgUpdatedCity', ['code' => $code, 'title' => $title, 'city' => $city])       : T::s('import.success.msgUpdated',     ['code' => $code, 'title' => $title])),
                'warning'  => $tcWarning,
            ]);
        }

        // New record: the text goes into the selected language column,
        // all other language columns start empty.
        $insCols = [];
        $insVals = [];
        foreach (self::getLanguages() as $lg) {
            $col       = 'TEXT' . $lg['col_suffix'];
            $insCols[] = $col;
            $insVals[] = ($col === $textField) ? "'{$textEsc}'" : "''";
        }
        $db->exec(
            "INSERT INTO messages (USER_ID, CODE, TITLE, CITY, " . implode(', ', $insCols) . ", AUDIO_SRC, TIMECODES)
             VALUES ({$userId}, '{$codeEsc}', '{$titleEsc}', '{$cityEsc}', " . implode(', ', $insVals) . ",
                     '{$audioSrcEsc}', " . ($timecodesEsc !== '' ? "'{$timecodesEsc}'" : "NULL") . ")"
        );

        return json_encode([
            'status'  => 'success',
            'action'  => 'inserted',
            'message' => ($city ? T::s('import.success.msgInsertedCity', ['code' => $code, 'title' => $title, 'city' => $city])       : T::s('import.success.msgInserted',     ['code' => $code, 'title' => $title])),
            'warning' => $tcWarning,
        ]);
    }

    // --------------------------------------------------------
    // Load full message data for edit mode
    // Params: code
    // --------------------------------------------------------
    private static function load_message_for_edit()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }
        $dbh  = Info::get('dbh');
        $code = mysqli_real_escape_string($dbh, trim(self::$args['code'] ?? ''));
        if ($code === '') {
            return json_encode(null);
        }
        $row = Info::get('db')->get(
            "SELECT ID, CODE, TITLE, CITY, " . self::textColumnList() . ", AUDIO_SRC, TIMECODES
             FROM messages WHERE CODE='{$code}' LIMIT 1"
        );
        return json_encode($row ?: null);
    }

    // --------------------------------------------------------
    // Search messages by code (for autocomplete)
    // Params: query
    // --------------------------------------------------------
    private static function search_messages_by_code()
    {
        $dbh = Info::get('dbh');
        $query = mysqli_real_escape_string($dbh, trim(self::$args['query'] ?? ''));

        if ($query === '') {
            return json_encode([]);
        }

        $list = Info::get('db')->select(
            "SELECT ID, CODE, TITLE, CITY
             FROM messages
             WHERE CODE LIKE '{$query}%' OR CODE LIKE '%{$query}%'
             ORDER BY CODE
             LIMIT 20"
        );

        return json_encode($list);
    }

    // ============================================================
    // LANGUAGES
    // ============================================================

    // --------------------------------------------------------
    // Add a new language
    // Admin only.
    // Params: code (e.g. "de"), label (e.g. "DE")
    //
    // Automatically:
    //   1. Validates the code (a-z only, 2-5 characters)
    //   2. Computes col_suffix = '_' + strtoupper(code)
    //   3. Inserts a record into the languages table
    //   4. ALTER TABLE song_list ADD COLUMN TEXT_DE LONGTEXT NULL
    //   5. ALTER TABLE messages  ADD COLUMN TEXT_DE LONGTEXT NULL
    // --------------------------------------------------------
    private static function add_language()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }

        $dbh = Info::get('dbh');
        $db = Info::get('db');
        $code = strtolower(trim(self::$args['code'] ?? ''));
        $label = strtoupper(trim(self::$args['label'] ?? ''));

        // --- Validate code ---
        if (!preg_match('/^[a-z]{2,5}$/', $code)) {
            return json_encode([
                'status' => 'error',
                'message' => T::s('import.lang.error.codeFormat')
            ]);
        }
        if (empty($label)) {
            return json_encode(['status' => 'error', 'message' => T::s('import.lang.error.labelEmpty')]);
        }

        // --- Check for duplicate ---
        $existing = $db->get(
            "SELECT code FROM languages WHERE code = '" . mysqli_real_escape_string($dbh, $code) . "'"
        );
        if ($existing) {
            return json_encode(['status' => 'error', 'message' => T::s('import.lang.error.exists', ['code' => $code])]);
        }

        // --- Compute suffix and column name ---
        $colSuffix = '_' . strtoupper($code);          // e.g. _DE
        $colName = 'TEXT' . $colSuffix;               // e.g. TEXT_DE
        $labelEsc = mysqli_real_escape_string($dbh, $label);
        $codeEsc = mysqli_real_escape_string($dbh, $code);
        $colNameEsc = mysqli_real_escape_string($dbh, $colName);

        // --- Determine next sort_order ---
        $maxOrder = $db->get("SELECT MAX(sort_order) AS m FROM languages");
        $sortOrder = ($maxOrder && $maxOrder['m'] !== null) ? (int)$maxOrder['m'] + 1 : 1;

        // --- ALTER TABLE: add column to song_list ---
        $tables = ['song_list', 'messages'];
        foreach ($tables as $table) {
            // Check if the column already exists (guard against re-runs)
            $colExists = $db->get(
                "SELECT COLUMN_NAME
                 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME   = '{$table}'
                   AND COLUMN_NAME  = '{$colName}'"
            );
            if (!$colExists) {
                $db->exec("ALTER TABLE `{$table}` ADD COLUMN `{$colName}` LONGTEXT NULL");
            }
        }

        // --- Insert record into languages ---
        $db->exec(
            "INSERT INTO languages (code, label, col_suffix, sort_order, is_default)
             VALUES ('{$codeEsc}', '{$labelEsc}', '{$colSuffix}', {$sortOrder}, 0)"
        );

        return json_encode([
            'status' => 'success',
            'message' => T::s('import.lang.success.added', ['label' => $label, 'column' => $colName])
        ]);
    }

    // --------------------------------------------------------
    // Delete a language
    // Admin only + requires the special password from config.php.
    //
    // Params: code, delete_password
    //
    // Guards:
    //   - cannot delete the language with is_default = 1
    //   - special password from config['lang_delete_password'] is verified
    //   - DROP COLUMN from song_list and messages
    // --------------------------------------------------------
    private static function delete_language()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }

        $dbh = Info::get('dbh');
        $db = Info::get('db');
        $code = strtolower(trim(self::$args['code'] ?? ''));
        $givenPassword = trim(self::$args['delete_password'] ?? '');
        $config = Info::get('config');

        // --- Verify special password ---
        $correctPassword = $config['lang_delete_password'] ?? '';
        if ($correctPassword === '' || $givenPassword !== $correctPassword) {
            return json_encode(['status' => 'error', 'message' => T::s('import.lang.error.wrongPassword')]);
        }

        // --- Look up language ---
        $codeEsc = mysqli_real_escape_string($dbh, $code);
        $lang = $db->get("SELECT * FROM languages WHERE code = '{$codeEsc}'");
        if (!$lang) {
            return json_encode(['status' => 'error', 'message' => T::s('import.lang.error.notFound', ['code' => $code])]);
        }

        // --- Forbid deletion of the default language ---
        if ((int)$lang['is_default'] === 1) {
            return json_encode([
                'status' => 'error',
                'message' => T::s('import.lang.error.cannotDeleteDefault', ['code' => $code])
            ]);
        }

        // --- Compute column name ---
        $colSuffix = $lang['col_suffix'];              // e.g. _DE
        $colName = 'TEXT' . $colSuffix;              // e.g. TEXT_DE

        // --- DROP COLUMN from song_list and messages ---
        $tables = ['song_list', 'messages'];
        foreach ($tables as $table) {
            $colExists = $db->get(
                "SELECT COLUMN_NAME
                 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME   = '{$table}'
                   AND COLUMN_NAME  = '{$colName}'"
            );
            if ($colExists) {
                $db->exec("ALTER TABLE `{$table}` DROP COLUMN `{$colName}`");
            }
        }

        // --- Delete record from languages ---
        $db->exec("DELETE FROM languages WHERE code = '{$codeEsc}'");

        return json_encode([
            'status' => 'success',
            'message' => T::s('import.lang.success.deleted', ['label' => $lang['label'], 'column' => $colName])
        ]);
    }
}
