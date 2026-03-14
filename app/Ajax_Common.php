<?php

/**
 * Common Ajax methods used across multiple pages
 */
trait Ajax_Common
{
    /**
     * Проверить MIME-тип файла через finfo (читает реальные байты файла).
     * @param  string $tmpPath  путь к временному файлу
     * @param  array  $allowed  разрешённые MIME-типы
     * @return bool
     */
    private static function checkMime(string $tmpPath, array $allowed): bool
    {
        if (!function_exists('finfo_open')) {
            // Если finfo недоступен — пропускаем (не блокируем)
            error_log('finfo extension not available — MIME check skipped');
            return true;
        }
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime  = finfo_file($finfo, $tmpPath);
        finfo_close($finfo);
        return in_array($mime, $allowed, true);
    }

    private static function get_song_list()
    {
        $listId = (int)self::$args['list_id'];

        // Динамически строим hasText_code поля по таблице languages
        $langs = Info::get('db')->select(
            "SELECT code, col_suffix FROM languages ORDER BY sort_order ASC"
        );
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

    // Новая версия учитывает sort_order = max(оба списка) + 1.
    private static function add_to_favorites()
    {
        $dbh    = Info::get('dbh');
        $userId = (int)$_SESSION['userId'];
        $songId = mysqli_real_escape_string($dbh, self::$args['id']);

        // Общий max sort_order по обоим спискам
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
        Info::get('db')->exec("insert into piano_favorites (groupId, SONGID) values ({$_SESSION['userId']},".mysqli_escape_string(Info::get('dbh'), self::$args['id']).")");
        self::updateSocket();
        return '';
    }

    private static function get_favorites()
    {
        $userId = $_SESSION['userId'];
        $sql = "SELECT f.ID as FID, l.*,
                       concat(l.num, ' - ', l.name) as dispName,
                       concat('/images/', l.LISTID, '/', l.num, '.jpg') as imageName,
                       f.SONGID,
                       n.LIST_NAME as bookName,
                       (l.TEXT    IS NOT NULL AND l.TEXT    != '') AS hasTextRu,
                       (l.TEXT_LT IS NOT NULL AND l.TEXT_LT != '') AS hasTextLt,
                       (l.TEXT_EN IS NOT NULL AND l.TEXT_EN != '') AS hasTextEn
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
        $userId = (int)$_SESSION['userId'];

        $settings = Info::get('db')->get(
            "SELECT favorites_order FROM user_settings WHERE group_id = {$userId}"
        );
        $order = ($settings && $settings['favorites_order'] === 'latest_top') ? 'DESC' : 'ASC';

        // Songs из favorites
        $songs = Info::get('db')->select(
            "SELECT
             f.ID           AS FID,
             f.sort_order   AS sort_order,
             'song'         AS itemType,
             l.ID, l.LISTID, l.NUM, l.NAME,
             l.TEXT, l.TEXT_LT, l.TEXT_EN,
             CONCAT(l.NUM, ' - ', l.NAME)                    AS dispName,
             n.LIST_NAME                                      AS bookName,
             CONCAT('/images/', l.LISTID, '/', l.NUM, '.jpg') AS imageName,
             f.SONGID,
             (l.TEXT    IS NOT NULL AND l.TEXT    != '') AS hasTextRu,
             (l.TEXT_LT IS NOT NULL AND l.TEXT_LT != '') AS hasTextLt,
             (l.TEXT_EN IS NOT NULL AND l.TEXT_EN != '') AS hasTextEn,
             NULL AS src,
             NULL AS media_type
         FROM favorites f
         LEFT JOIN song_list l  ON l.ID      = f.SONGID
         LEFT JOIN list_names n ON n.LIST_ID = l.LISTID
         WHERE f.groupId = {$userId}"
        );

        // Media из tech_media_favorites
        $media = Info::get('db')->select(
            "SELECT
             id             AS FID,
             sort_order     AS sort_order,
             media_type     AS itemType,
             NULL AS ID, NULL AS LISTID, NULL AS NUM, name AS NAME,
             NULL AS TEXT, NULL AS TEXT_LT, NULL AS TEXT_EN,
             name           AS dispName,
             NULL           AS bookName,
             NULL           AS imageName,
             NULL           AS SONGID,
             0 AS hasTextRu, 0 AS hasTextLt, 0 AS hasTextEn,
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
                where f.groupId={$_SESSION['userId']}
                ORDER BY FID";
        $list = Info::get('db')->select($sql);
        return json_encode($list);
    }

    private static function clear_favorites()
    {
        $sql = "DELETE FROM favorites WHERE groupId={$_SESSION['userId']}";
        Info::get('db')->exec($sql);
        self::updateSocket();
        return '';
    }

    private static function clear_piano_favorites()
    {
        $sql = "DELETE FROM piano_favorites WHERE groupId={$_SESSION['userId']}";
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
        $userId = (int)$_SESSION['userId'];
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
        $userId = $_SESSION['userId'];
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
        $userId = (int)$_SESSION['userId'];
        $targetGroupId = isset(self::$args['target_group_id']) ? (int)self::$args['target_group_id'] : $userId;

        Info::get('db')->exec("DELETE FROM current WHERE groupId = {$targetGroupId}");
        self::updateSocket($targetGroupId);
        return '';
    }

    private static function update_song()
    {
        $songId = mysqli_escape_string(Info::get('dbh'), self::$args['id']);

        // Preserve CRLF line breaks - don't strip them
        $text = self::$args['text'];
        // Escape for SQL but keep line breaks
        $text = mysqli_escape_string(Info::get('dbh'), $text);

        $name = mysqli_escape_string(Info::get('dbh'), self::$args['name']);

        // Handle Lithuanian and English texts if provided
        $textLt = isset(self::$args['text_lt']) ? mysqli_escape_string(Info::get('dbh'), self::$args['text_lt']) : '';
        $textEn = isset(self::$args['text_en']) ? mysqli_escape_string(Info::get('dbh'), self::$args['text_en']) : '';

        Info::get('db')->exec("UPDATE song_list SET TEXT = '{$text}', TEXT_LT = '{$textLt}', TEXT_EN = '{$textEn}', NAME = '{$name}' WHERE ID = {$songId}");
        self::updateSocket();
        return json_encode(['status' => 'success']);
    }

    private static function create_song()
    {
        $listId = mysqli_escape_string(Info::get('dbh'), self::$args['list_id']);

        // Preserve CRLF line breaks - don't strip them
        $text = mysqli_escape_string(Info::get('dbh'), self::$args['text']);
        $name = mysqli_escape_string(Info::get('dbh'), self::$args['name']);

        // Handle Lithuanian and English texts if provided
        $textLt = isset(self::$args['text_lt']) ? mysqli_escape_string(Info::get('dbh'), self::$args['text_lt']) : '';
        $textEn = isset(self::$args['text_en']) ? mysqli_escape_string(Info::get('dbh'), self::$args['text_en']) : '';

        // Insert the song to get the auto-generated ID
        Info::get('db')->exec("INSERT INTO song_list (LISTID, NUM, NAME, TEXT, TEXT_LT, TEXT_EN) VALUES ({$listId}, '', '{$name}', '{$text}', '{$textLt}', '{$textEn}')");

        // Get the newly created song's ID
        $newSongId = Info::get('db')->insert_id();

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

        // [SECURITY #5] Проверка расширения
        $ext         = strtolower(pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION));
        $allowedExt  = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        if (!in_array($ext, $allowedExt, true)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid extension: ' . $ext]);
        }

        // [SECURITY #5] Проверка реального MIME-типа
        $allowedMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!self::checkMime($_FILES['image']['tmp_name'], $allowedMime)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid file type (MIME mismatch)']);
        }

        $uploadDir = __DIR__ . '/../public/images/' . $song['LISTID'] . '/';
        if (!file_exists($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        $filename   = $song['NUM'] . '.jpg';
        $targetFile = $uploadDir . $filename;

        if (move_uploaded_file($_FILES['image']['tmp_name'], $targetFile)) {
            self::updateSocket();
            return json_encode(['status' => 'success', 'path' => '/images/' . $song['LISTID'] . '/' . $filename]);
        }
        return json_encode(['status' => 'error', 'message' => 'Failed to move uploaded file']);
    }

    private static function updateSocket($targetGroupId = null)
    {
        $err1 = '';
        $err2 = '';
        $instance = stream_socket_client("tcp://127.0.0.1:2346", $err1, $err2);
        if ($instance) {
            // [SECURITY] Include userId (groupId) so WebSocket broadcasts to the correct group
            // If $targetGroupId is specified, notify that group; otherwise notify current user's group
            $groupId = $targetGroupId !== null ? (int)$targetGroupId : (isset($_SESSION['userId']) ? (int)$_SESSION['userId'] : null);
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
        $userId = $_SESSION['userId'];
        $settings = Info::get('db')->get("SELECT * FROM user_settings WHERE group_id = {$userId}");

        if (!$settings) {
            $settings = [
                'group_id' => $userId,
                'display_name' => $_SESSION['userName'],
                'favorites_order' => 'latest_bottom',
                'available_lists' => '1,2,3,4,5,6',
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
                'sermon_notes_font_size' => 13,
                'sermon_scale_chips'     => 0,
            ];
        }

        if (empty($settings['sermon_notes_bg_color']))   $settings['sermon_notes_bg_color']   = '#2b2b2b';
        if (empty($settings['sermon_bible_base_color'])) $settings['sermon_bible_base_color']  = '#1565c0';
        if (empty($settings['sermon_msg_base_color']))   $settings['sermon_msg_base_color']    = '#6a1b9a';
        if (empty($settings['sermon_notes_font_size']))  $settings['sermon_notes_font_size'] = 13;
        if (empty($settings['sermon_scale_chips']))      $settings['sermon_scale_chips']     = 0;

        return json_encode($settings);
    }

    private static function get_languages()
    {
        $langs = Info::get('db')->select(
            "SELECT l.code, l.label, l.col_suffix, l.sort_order, l.is_default, bt.ID as translation_id
             FROM languages l
             LEFT JOIN bible_translations bt ON bt.LANG = l.code
             ORDER BY l.sort_order ASC"
        );
        return json_encode($langs);
    }
}
