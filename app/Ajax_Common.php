<?php

/**
 * Common Ajax methods used across multiple pages
 */
trait Ajax_Common
{
    /**
     * Validate MIME type via finfo (reads actual file bytes).
     * @param  string $tmpPath  path to the temporary file
     * @param  array  $allowed  allowed MIME types
     * @return bool
     */
    private static function checkMime(string $tmpPath, array $allowed): bool
    {
        if (!function_exists('finfo_open')) {
            // finfo not available — skip check (do not block)
            error_log('finfo extension not available — MIME check skipped');
            return true;
        }
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime  = finfo_file($finfo, $tmpPath);
        finfo_close($finfo);
        return in_array($mime, $allowed, true);
    }

    /** Cached language list for the current request. */
    private static $cachedLanguages = null;

    /** Returns all languages (code + col_suffix) ordered by sort_order, cached per request. */
    private static function getLanguages(): array
    {
        if (self::$cachedLanguages === null) {
            self::$cachedLanguages = Info::get('db')->select(
                "SELECT code, col_suffix FROM languages ORDER BY sort_order ASC"
            );
        }
        return self::$cachedLanguages;
    }

    /** Cached subset of getLanguages() limited to languages that have NAME{suffix} columns in bible_books. */
    private static $cachedBibleLanguages = null;

    /**
     * Returns the subset of getLanguages() for which NAME{col_suffix} columns
     * actually exist in bible_books (and TEXT{col_suffix} in bible_verses).
     * The Bible tables are not auto-extended when add_language() runs, so a language
     * may exist in the registry without corresponding Bible columns.
     */
    private static function getBibleLanguages(): array
    {
        if (self::$cachedBibleLanguages !== null) {
            return self::$cachedBibleLanguages;
        }
        $rows = Info::get('db')->select(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'bible_books'
               AND COLUMN_NAME LIKE 'NAME%'"
        );
        $existingSuffixes = [''];
        foreach ($rows as $r) {
            $col = $r['COLUMN_NAME'];
            if ($col === 'NAME') continue;
            $existingSuffixes[] = substr($col, 4); // 'NAME_LT' → '_LT'
        }
        $filtered = [];
        foreach (self::getLanguages() as $lang) {
            if (in_array($lang['col_suffix'], $existingSuffixes, true)) {
                $filtered[] = $lang;
            }
        }
        self::$cachedBibleLanguages = $filtered;
        return $filtered;
    }

    private static function get_song_list()
    {
        $listId = (int)self::$args['list_id'];

        // Build hasText_* fields dynamically from the languages table
        $langs = self::getLanguages();
        $hasTextFields = '';
        foreach ($langs as $lang) {
            $col   = 'TEXT' . $lang['col_suffix'];        // TEXT, TEXT_LT, TEXT_DE…
            $alias = 'hasText_' . $lang['code'];           // hasText_ru, hasText_lt…
            $hasTextFields .= ", (l.{$col} IS NOT NULL AND l.{$col} != '') AS {$alias}";
        }

        $list = Info::get('db')->select(
            "SELECT l.*,
                concat(l.NUM, '   ', l.NAME) as dispName,
                n.LIST_NAME as bookName
                {$hasTextFields}
         FROM song_list l
         LEFT JOIN list_names n ON n.LIST_ID = l.LISTID
         WHERE l.LISTID = {$listId}
         ORDER BY l.NUM"
        );
        return json_encode($list);
    }

    private static function get_songs_for_search()
    {
        $rawIds = isset(self::$args['list_ids']) ? self::$args['list_ids'] : '';
        $rawIds = preg_replace('/[^0-9,]/', '', $rawIds);
        if (!$rawIds) return json_encode([]);

        $langs = self::getLanguages();
        $hasTextFields = '';
        foreach ($langs as $lang) {
            $col   = 'TEXT' . $lang['col_suffix'];
            $alias = 'hasText_' . $lang['code'];
            $hasTextFields .= ", (l.{$col} IS NOT NULL AND l.{$col} != '') AS {$alias}";
        }

        $list = Info::get('db')->select(
            "SELECT l.*,
                concat(l.NUM, '   ', l.NAME) as dispName,
                concat('/images/', l.LISTID, '/', l.NUM, '.jpg') as imageName,
                n.LIST_NAME as bookName
                {$hasTextFields}
         FROM song_list l
         LEFT JOIN list_names n ON n.LIST_ID = l.LISTID
         WHERE l.LISTID IN ({$rawIds})
         ORDER BY l.LISTID, l.NUM+0"
        );
        return json_encode($list);
    }

    // Uses combined max sort_order from both favorites lists + 1.
    private static function add_to_favorites()
    {
        $dbh    = Info::get('dbh');
        $userId = (int)$_SESSION['curGroupId'];
        $songId = mysqli_real_escape_string($dbh, self::$args['id']);

        // Combined max sort_order across both lists
        $maxSong  = Info::get('db')->get(
            "SELECT IFNULL(MAX(sort_order), 0) AS m FROM favorites WHERE groupId = {$userId}"
        );
        $maxMedia = Info::get('db')->get(
            "SELECT IFNULL(MAX(sort_order), 0) AS m FROM tech_media_favorites WHERE group_id = {$userId}"
        );
        $sortOrder = max((int)$maxSong['m'], (int)$maxMedia['m']) + 1;

        Info::get('db')->exec(
            "INSERT IGNORE INTO favorites (groupId, SONGID, sort_order)
             VALUES ({$userId}, '{$songId}', {$sortOrder})"
        );

        self::updateSocket();
        return '';
    }

    private static function add_to_piano_favorites()
    {
        Info::get('db')->exec("insert into piano_favorites (groupId, SONGID) values ({$_SESSION['curGroupId']},".mysqli_escape_string(Info::get('dbh'), self::$args['id']).")");
        self::updateSocket();
        return '';
    }

    private static function get_favorites()
    {
        $userId = $_SESSION['curGroupId'];

        $langs = self::getLanguages();
        $hasTextFields = '';
        foreach ($langs as $lang) {
            $col   = 'TEXT' . $lang['col_suffix'];
            $alias = 'hasText_' . $lang['code'];
            $hasTextFields .= ", (l.{$col} IS NOT NULL AND l.{$col} != '') AS {$alias}";
        }

        $sql = "SELECT f.ID as FID, l.*,
                       concat(l.num, ' - ', l.name) as dispName,
                       concat('/images/', l.LISTID, '/', l.num, '.jpg') as imageName,
                       f.SONGID,
                       n.LIST_NAME as bookName
                       {$hasTextFields}
                FROM favorites f
                LEFT JOIN song_list l  ON l.ID    = f.SONGID
                LEFT JOIN list_names n ON n.LIST_ID = l.LISTID
                WHERE f.groupId = {$userId}
                ORDER BY FID";
        $list = Info::get('db')->select($sql);
        return json_encode($list);
    }

    private static function get_favorites_with_text()
    {
        $userId = (int)$_SESSION['curGroupId'];

        $settings = Info::get('db')->get(
            "SELECT favorites_order FROM user_settings WHERE group_id = {$userId}"
        );
        $order = ($settings && $settings['favorites_order'] === 'latest_top') ? 'DESC' : 'ASC';

        $langs = self::getLanguages();
        $hasTextFields = '';
        $mediaHasTextFields = '';
        foreach ($langs as $lang) {
            $col   = 'TEXT' . $lang['col_suffix'];
            $alias = 'hasText_' . $lang['code'];
            $hasTextFields      .= ", (l.{$col} IS NOT NULL AND l.{$col} != '') AS {$alias}";
            $mediaHasTextFields .= ", 0 AS {$alias}";
        }

        // Songs from favorites
        $songs = Info::get('db')->select(
            "SELECT
             f.ID           AS FID,
             f.sort_order   AS sort_order,
             'song'         AS itemType,
             l.*,
             CONCAT(l.NUM, ' - ', l.NAME)                    AS dispName,
             n.LIST_NAME                                      AS bookName,
             CONCAT('/images/', l.LISTID, '/', l.NUM, '.jpg') AS imageName,
             f.SONGID
             {$hasTextFields},
             NULL AS src,
             NULL AS media_type
         FROM favorites f
         LEFT JOIN song_list l  ON l.ID      = f.SONGID
         LEFT JOIN list_names n ON n.LIST_ID = l.LISTID
         WHERE f.groupId = {$userId}"
        );

        // Media from tech_media_favorites
        $media = Info::get('db')->select(
            "SELECT
             id             AS FID,
             sort_order     AS sort_order,
             media_type     AS itemType,
             NULL AS ID, NULL AS LISTID, NULL AS NUM, name AS NAME,
             name           AS dispName,
             NULL           AS bookName,
             NULL           AS imageName,
             NULL           AS SONGID
             {$mediaHasTextFields},
             src, media_type
         FROM tech_media_favorites
         WHERE group_id = {$userId}"
        );

        // Merge + sort by sort_order (then by FID for stable sort)
        $all = array_merge($songs, $media);
        usort($all, function($a, $b) use ($order) {
            $diff = (int)$a['sort_order'] - (int)$b['sort_order'];
            if ($diff !== 0) return $order === 'DESC' ? -$diff : $diff;
            return $order === 'DESC'
                ? (int)$b['FID'] - (int)$a['FID']
                : (int)$a['FID'] - (int)$b['FID'];
        });

        return json_encode(array_values($all));
    }

    private static function get_piano_favorites()
    {
        $sql = "SELECT f.ID as FID, l.*, concat(l.num, ' - ',l.name) as dispName,
                        concat('/images/',l.LISTID,'/',l.num,'.jpg') as imageName, f.SONGID FROM piano_favorites f
                left join song_list l ON l.ID=f.SONGID
                where f.groupId={$_SESSION['curGroupId']}
                ORDER BY FID";
        $list = Info::get('db')->select($sql);
        return json_encode($list);
    }

    private static function clear_favorites()
    {
        $sql = "DELETE FROM favorites WHERE groupId={$_SESSION['curGroupId']}";
        Info::get('db')->exec($sql);
        self::updateSocket();
        return '';
    }

    private static function clear_piano_favorites()
    {
        $sql = "DELETE FROM piano_favorites WHERE groupId={$_SESSION['curGroupId']}";
        Info::get('db')->exec($sql);
        self::updateSocket();
        return '';
    }

    private static function delete_favorite_item()
    {
        $sql = "DELETE FROM favorites WHERE ID=".self::$args['id'];
        Info::get('db')->exec($sql);
        self::updateSocket();
        return '';
    }

    private static function delete_piano_favorite_item()
    {
        $sql = "DELETE FROM piano_favorites WHERE ID=".self::$args['id'];
        Info::get('db')->exec($sql);
        self::updateSocket();
        return '';
    }

    private static function set_image()
    {
        $userId = (int)$_SESSION['curGroupId'];
        $listId = mysqli_escape_string(Info::get('dbh'), self::$args['list_id']);
        $imageNum = mysqli_escape_string(Info::get('dbh'), self::$args['image_num']);

        Info::get('db')->exec("DELETE FROM current WHERE groupId = {$userId}");
        Info::get('db')->exec(
            "INSERT INTO current (groupId, image, text, song_name)
             VALUES ({$userId}, '/images/{$listId}/{$imageNum}.jpg', '', '')"
        );
        self::updateSocket();
        return '';
    }

    private static function get_image()
    {
        $userId = $_SESSION['curGroupId'];
        $img = Info::get('db')->select(
            "SELECT image, text, song_name, video_src, video_state
         FROM current WHERE groupId = " . (int)$userId
        );

        $settings = Info::get('db')->get(
            "SELECT * FROM user_settings WHERE group_id = " . (int)$userId
        );

        if (count($img) > 0) {
            $img[0]['user_settings'] = $settings;
        }

        return json_encode($img);
    }

    private static function get_whole_text()
    {
        $songId = mysqli_escape_string(Info::get('dbh'), self::$args['id']);
        $txt = Info::get('db')->select("select TEXT from song_list where ID={$songId}");
        return json_encode($txt[0]);
    }

    private static function clear_image()
    {
        $userId = (int)$_SESSION['curGroupId'];
        $targetGroupId = isset(self::$args['target_group_id']) ? (int)self::$args['target_group_id'] : $userId;

        Info::get('db')->exec("DELETE FROM current WHERE groupId = {$targetGroupId}");
        self::updateSocket($targetGroupId);
        return '';
    }

    private static function update_song()
    {
        $dbh    = Info::get('dbh');
        $songId = mysqli_escape_string($dbh, self::$args['id']);
        $name   = mysqli_escape_string($dbh, self::$args['name']);

        $langs = self::getLanguages();

        $setClauses = "NAME = '{$name}'";
        foreach ($langs as $lang) {
            $colName = 'TEXT' . $lang['col_suffix'];
            $argKey  = 'text' . strtolower($lang['col_suffix']);
            $val = isset(self::$args[$argKey]) ? mysqli_escape_string($dbh, self::$args[$argKey]) : '';
            $setClauses .= ", {$colName} = '{$val}'";
        }

        Info::get('db')->exec("UPDATE song_list SET {$setClauses} WHERE ID = {$songId}");
        self::updateSocket();
        return json_encode(['status' => 'success']);
    }

    private static function check_song_num_exists()
    {
        $listId = (int)self::$args['list_id'];
        $songNum = mysqli_escape_string(Info::get('dbh'), self::$args['song_num']);

        $existing = Info::get('db')->get("SELECT ID FROM song_list WHERE LISTID = {$listId} AND NUM = '{$songNum}'");

        return json_encode(['exists' => $existing !== null]);
    }

    private static function create_song()
    {
        $dbh    = Info::get('dbh');
        $listId = mysqli_escape_string($dbh, self::$args['list_id']);
        $name   = mysqli_escape_string($dbh, self::$args['name']);

        $langs = self::getLanguages();

        $colNames = 'LISTID, NUM, NAME';
        $values   = "{$listId}, '', '{$name}'";
        foreach ($langs as $lang) {
            $colName = 'TEXT' . $lang['col_suffix'];
            $argKey  = 'text' . strtolower($lang['col_suffix']);
            $val = isset(self::$args[$argKey]) ? mysqli_escape_string($dbh, self::$args[$argKey]) : '';
            $colNames .= ", {$colName}";
            $values   .= ", '{$val}'";
        }

        // Insert the song to get the auto-generated ID
        Info::get('db')->exec("INSERT INTO song_list ({$colNames}) VALUES ({$values})");

        // Get the newly created song's ID
        $newSongId = Info::get('db')->insert_id();

        // Use provided song_num or generate based on ID
        if (isset(self::$args['song_num']) && self::$args['song_num'] !== '') {
            $num = mysqli_escape_string(Info::get('dbh'), self::$args['song_num']);
            // Check uniqueness
            $existing = Info::get('db')->get("SELECT ID FROM song_list WHERE LISTID = {$listId} AND NUM = '{$num}' AND ID != {$newSongId}");
            if ($existing) {
                // Delete the created song and return error
                Info::get('db')->exec("DELETE FROM song_list WHERE ID = {$newSongId}");
                return json_encode(['status' => 'error', 'message' => 'Номер песни уже используется']);
            }
        } else {
            // Generate NUM based on the ID
            $baseNum = (string)$newSongId;
            $num = $baseNum;
            $suffix = 1;

            // Check if NUM already exists in this song list and add suffix if needed
            while (true) {
                $existing = Info::get('db')->get("SELECT ID FROM song_list WHERE LISTID = {$listId} AND NUM = '{$num}' AND ID != {$newSongId}");
                if (!$existing) {
                    break;
                }
                $num = $baseNum . '_' . $suffix;
                $suffix++;
            }
        }

        // Update the NUM field
        Info::get('db')->exec("UPDATE song_list SET NUM = '{$num}' WHERE ID = {$newSongId}");

        self::updateSocket();
        return json_encode(['status' => 'success', 'song_id' => $newSongId, 'num' => $num]);
    }

    private static function upload_song_image()
    {
        if (!isset($_POST['song_id'])) {
            return json_encode(['status' => 'error', 'message' => 'No song_id provided']);
        }

        $songId = (int)$_POST['song_id'];
        $song   = Info::get('db')->get("SELECT LISTID, NUM FROM song_list WHERE ID = {$songId}");
        if (!$song) {
            return json_encode(['status' => 'error', 'message' => 'Song not found']);
        }

        if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
            return json_encode(['status' => 'error', 'message' => 'Upload error']);
        }

        // [SECURITY #5] Validate file extension
        $ext         = strtolower(pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION));
        $allowedExt  = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        if (!in_array($ext, $allowedExt, true)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid extension: ' . $ext]);
        }

        // [SECURITY #5] Validate actual MIME type
        $allowedMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!self::checkMime($_FILES['image']['tmp_name'], $allowedMime)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid file type (MIME mismatch)']);
        }

        $uploadDir = __DIR__ . '/../public/images/' . $song['LISTID'] . '/';
        if (!file_exists($uploadDir)) {
            if (!mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
                return json_encode(['status' => 'error', 'message' => 'Failed to create upload directory: ' . $uploadDir]);
            }
        }

        $filename   = $song['NUM'] . '.jpg';
        $targetFile = $uploadDir . $filename;

        if (move_uploaded_file($_FILES['image']['tmp_name'], $targetFile)) {
            self::updateSocket();
            return json_encode(['status' => 'success', 'path' => '/images/' . $song['LISTID'] . '/' . $filename]);
        }
        return json_encode(['status' => 'error', 'message' => 'Failed to move uploaded file. Check write permissions on: ' . $uploadDir]);
    }

    /**
     * Lightweight session keepalive — touching the session is enough.
     * Called by the client every ~10 minutes to prevent server-side expiry.
     */
    private static function ping()
    {
        return json_encode(['status' => 'ok']);
    }

    private static function updateSocket($targetGroupId = null)
    {
        $err1 = '';
        $err2 = '';
        $instance = stream_socket_client("tcp://127.0.0.1:2346", $err1, $err2);
        if ($instance) {
            // [SECURITY] Include userId (groupId) so WebSocket broadcasts to the correct group
            // If $targetGroupId is specified, notify that group; otherwise notify current user's group
            $groupId = $targetGroupId !== null ? (int)$targetGroupId : (isset($_SESSION['curGroupId']) ? (int)$_SESSION['curGroupId'] : null);
            fwrite($instance, json_encode(['type' => 'update_needed', 'groupId' => $groupId]) . "\n");
            fclose($instance);
        }
    }

    private static function get_all_song_lists()
    {
        $lists = Info::get('db')->select("SELECT LIST_ID, LIST_NAME FROM list_names ORDER BY LIST_ID");
        return json_encode($lists);
    }

    private static function get_user_settings()
    {
        $userId = $_SESSION['curGroupId'];
        $settings = Info::get('db')->get("SELECT * FROM user_settings WHERE group_id = {$userId}");

        if (!$settings) {
            $settings = [
                'group_id' => $userId,
                'display_name' => $_SESSION['userName'],
                'favorites_order' => 'latest_bottom',
                'available_lists' => '1,2,3,4,5,6',
                'available_languages' => null,
                'placeholder_image' => null,
                'main_bg_color' => '#000000',
                'main_font' => 'Arial',
                'main_font_color' => '#FFFFFF',
                'streaming_bg_color' => '#000000',
                'streaming_font' => 'Arial',
                'streaming_font_color' => '#FFFFFF',
                'streaming_height_percent' => 100,
                'sermon_notes_bg_color'   => '#2b2b2b',
                'sermon_bible_base_color' => '#1565c0',
                'sermon_msg_base_color'   => '#6a1b9a',
                'sermon_prep_font_size'  => 13,
                'sermon_notes_font_size' => 100,
                'sermon_scale_chips'     => 0,
                'main_font_max_size'     => 64,
                'slide_font_max_size'    => 64,
                'ui_lang'                => 'ru',
            ];
        }

        if (empty($settings['ui_lang']) || !in_array($settings['ui_lang'], ['ru', 'de', 'en'], true)) {
            $settings['ui_lang'] = 'ru';
        }
        if (empty($settings['sermon_notes_bg_color']))   $settings['sermon_notes_bg_color']   = '#2b2b2b';
        if (empty($settings['sermon_bible_base_color'])) $settings['sermon_bible_base_color']  = '#1565c0';
        if (empty($settings['sermon_msg_base_color']))   $settings['sermon_msg_base_color']    = '#6a1b9a';
        if (empty($settings['sermon_prep_font_size']) || $settings['sermon_prep_font_size'] < 10)
            $settings['sermon_prep_font_size']  = 13;
        if (empty($settings['sermon_notes_font_size']) || $settings['sermon_notes_font_size'] < 50)
            $settings['sermon_notes_font_size'] = 100;
        if (empty($settings['sermon_scale_chips']))      $settings['sermon_scale_chips']     = 0;
        if (empty($settings['main_font_max_size'])  || $settings['main_font_max_size']  < 20) $settings['main_font_max_size']  = 64;
        if (empty($settings['slide_font_max_size']) || $settings['slide_font_max_size'] < 20) $settings['slide_font_max_size'] = 64;

        return json_encode($settings);
    }

    private static function get_languages()
    {
        $userId  = $_SESSION['curGroupId'];
        $setting = Info::get('db')->getValue(
            "SELECT available_languages FROM user_settings WHERE group_id = {$userId}"
        );

        $sql = "SELECT l.code, l.label, l.col_suffix, l.sort_order, l.is_default
                FROM languages l";

        if ($setting) {
            $codes = array_values(array_filter(array_map('trim', explode(',', $setting))));
            if (!empty($codes)) {
                $placeholders = implode(',', array_map(function ($c) {
                    return "'" . mysqli_escape_string(Info::get('dbh'), $c) . "'";
                }, $codes));
                $sql .= " WHERE l.code IN ({$placeholders})";
            }
        }

        $sql .= " ORDER BY l.sort_order ASC";
        $langs = Info::get('db')->select($sql);
        return json_encode($langs);
    }

    /** Returns ALL languages regardless of group settings (used by admin language management). */
    private static function get_all_languages()
    {
        $langs = Info::get('db')->select(
            "SELECT l.code, l.label, l.col_suffix, l.sort_order, l.is_default
             FROM languages l
             ORDER BY l.sort_order ASC"
        );
        return json_encode($langs);
    }
}
