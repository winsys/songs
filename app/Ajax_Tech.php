<?php

/**
 * Tech page Ajax methods
 * Handles Bible, messages, media, video controls
 */
trait Ajax_Tech
{
    private static function get_current_state()
    {
        $userId = (int)$_SESSION['curGroupId'];
        $row = Info::get('db')->get("SELECT image, text, song_name, chapter_indices, video_src FROM current WHERE groupId = {$userId}");

        if (!$row) {
            return json_encode(['image' => '', 'text' => '', 'song_name' => '', 'chapter_indices' => '', 'video_src' => '']);
        }

        return json_encode($row);
    }

    /**
     * Return the technician's two shared display-target selections
     * (leader channel + sermon channel) together with the list of available
     * targets (own group + approved groups). Used to populate the two selects
     * in the tech header.
     */
    private static function get_display_target_settings()
    {
        $userId = (int)$_SESSION['curGroupId'];

        $row = Info::get('db')->get(
            "SELECT leader_display_target, sermon_display_target
             FROM user_settings WHERE group_id = {$userId} LIMIT 1"
        );

        $leader = ($row && $row['leader_display_target'] !== null) ? (int)$row['leader_display_target'] : null;
        $sermon = ($row && $row['sermon_display_target'] !== null) ? (int)$row['sermon_display_target'] : null;

        return json_encode([
            'status'  => 'ok',
            'leader_display_target' => $leader,
            'sermon_display_target' => $sermon,
        ]);
    }

    /**
     * Set one of the two shared display targets (channel = 'leader'|'sermon'),
     * persist it, and notify the group over WebSocket so the leader / sermon
     * pages pick up the new target.
     */
    private static function set_display_target()
    {
        $userId  = (int)$_SESSION['curGroupId'];
        $channel = isset(self::$args['channel']) ? (string)self::$args['channel'] : '';
        if ($channel !== 'leader' && $channel !== 'sermon') {
            return json_encode(['status' => 'error', 'message' => 'Invalid channel']);
        }

        // null/0/'' => "do not broadcast"
        $raw    = isset(self::$args['target_group_id']) ? self::$args['target_group_id'] : null;
        $target = ($raw === null || $raw === '' || (int)$raw <= 0) ? null : (int)$raw;

        // Ensure a settings row exists, then update the chosen column.
        Info::get('db')->exec(
            "INSERT IGNORE INTO user_settings (group_id) VALUES ({$userId})"
        );
        $col    = $channel === 'leader' ? 'leader_display_target' : 'sermon_display_target';
        $valSql = $target === null ? 'NULL' : (int)$target;
        Info::get('db')->exec(
            "UPDATE user_settings SET {$col} = {$valSql} WHERE group_id = {$userId}"
        );

        // Notify the group: leader / sermon pages update their selectedDisplayTarget.
        self::broadcastToGroup($userId, [
            'type' => 'display_target_changed',
            'data' => [
                'channel'        => $channel,
                'display_target' => $target,
            ],
        ]);

        return json_encode(['status' => 'ok', 'channel' => $channel, 'display_target' => $target]);
    }

    private static function set_tech_image()
    {
        $dbh        = Info::get('dbh');
        $userId     = (int)$_SESSION['curGroupId'];
        $image_name = mysqli_real_escape_string($dbh, self::$args['image_name'] ?? '');
        $targetGroupId = self::resolveDisplayTarget($userId);
        if ($targetGroupId === null) {
            return ''; // broadcast disabled for this channel — leave screens alone
        }

        Info::get('db')->exec("DELETE FROM current WHERE groupId = {$targetGroupId}");
        Info::get('db')->exec(
            "INSERT INTO current (groupId, image, text, song_name, chapter_indices, video_src, video_state)
         VALUES ({$targetGroupId}, '{$image_name}', '', '', '', '', 'stopped')"
        );
        self::updateSocket($targetGroupId);
        return '';
    }

    private static function set_text()
    {
        $dbh        = Info::get('dbh');
        $userId     = (int)$_SESSION['curGroupId'];
        $text       = mysqli_real_escape_string($dbh, self::$args['text']       ?? '');
        $image_name = mysqli_real_escape_string($dbh, self::$args['image_name'] ?? '');
        $song_name  = mysqli_real_escape_string($dbh, self::$args['song_name']  ?? '');
        $chapter_indices = mysqli_real_escape_string($dbh, self::$args['chapter_indices'] ?? '');

        $row = Info::get('db')->get(
            "SELECT groupId FROM current WHERE groupId={$userId} AND image='{$image_name}'"
        );
        if ($row) {
            Info::get('db')->exec(
                "UPDATE current
                 SET text='{$text}', song_name='{$song_name}', chapter_indices='{$chapter_indices}'
                 WHERE groupId={$userId} AND image='{$image_name}'"
            );
        } elseif ($text !== '') {
            // The console may have selected this song by following the leader
            // (leader_song_changed) without pushing its image row; a verse click
            // must still reach the screen, so replace the group's current row.
            // Empty text (verse toggle-off) keeps the old silent no-op to avoid
            // resurrecting a stale song image over unrelated screen content.
            Info::get('db')->exec("DELETE FROM current WHERE groupId={$userId}");
            Info::get('db')->exec(
                "INSERT INTO current (groupId, image, text, song_name, chapter_indices, video_src, video_state)
                 VALUES ({$userId}, '{$image_name}', '{$text}', '{$song_name}', '{$chapter_indices}', '', 'stopped')"
            );
        }
        self::updateSocket();
        return '';
    }

    // -----------------------------------------------------------
    // Get all Bible translations.
    // Each row also gets a `supported_langs` array — language codes the
    // translation can actually display content in. This is determined by
    // sampling Genesis 1:1 and checking which TEXT* columns are populated.
    // The Synodal row, for example, typically holds RU primary text plus
    // parallel LT/EN columns and so supports {ru, lt, en} despite LANG='ru'.
    // -----------------------------------------------------------
    private static function get_bible_translations()
    {
        $langs = self::getBibleLanguages();

        $cols = ["t.ID", "t.NAME", "t.LANG", "t.SORT_ORDER"];
        $cols[] = "(v.TEXT IS NOT NULL AND v.TEXT != '') AS has_text";
        foreach ($langs as $lang) {
            if ($lang['col_suffix'] !== '') {
                $s = $lang['col_suffix'];
                $alias = 'has_text' . strtolower($s);
                $cols[] = "(v.TEXT{$s} IS NOT NULL AND v.TEXT{$s} != '') AS {$alias}";
            }
        }

        $sql = "SELECT " . implode(', ', $cols) . "
                FROM bible_translations t
                LEFT JOIN bible_books b
                       ON b.TRANSLATION_ID = t.ID AND b.BOOK_NUM = 1
                LEFT JOIN bible_verses v
                       ON v.BOOK_ID = b.ID AND v.CHAPTER_NUM = 1 AND v.VERSE_NUM = 1
                ORDER BY t.SORT_ORDER, t.ID";
        $list = Info::get('db')->select($sql);

        foreach ($list as &$row) {
            $supported = [];
            if (!empty($row['has_text'])) $supported[] = $row['LANG'];
            foreach ($langs as $lang) {
                if ($lang['col_suffix'] !== '') {
                    $key = 'has_text' . strtolower($lang['col_suffix']);
                    if (!empty($row[$key])) $supported[] = $lang['code'];
                }
            }
            $row['supported_langs'] = array_values(array_unique($supported));
            // Drop intermediate has_* helpers from the response.
            foreach (array_keys($row) as $k) {
                if (strpos($k, 'has_text') === 0) unset($row[$k]);
            }
        }
        unset($row);
        return json_encode($list);
    }

    // -----------------------------------------------------------
    // Get all books for a given translation
    // Params: translation_id
    // -----------------------------------------------------------
    private static function get_bible_books()
    {
        $translationId = (int)self::$args['translation_id'];

        $cols = 'ID, BOOK_NUM, NAME';
        foreach (self::getBibleLanguages() as $lang) {
            if ($lang['col_suffix'] !== '') {
                $cols .= ', NAME' . $lang['col_suffix'];
            }
        }

        $list = Info::get('db')->select(
            "SELECT {$cols}
             FROM bible_books
             WHERE TRANSLATION_ID = {$translationId}
             ORDER BY BOOK_NUM"
        );
        return json_encode($list);
    }

    // -----------------------------------------------------------
    // Get chapter numbers for a book
    // Params: book_id
    // -----------------------------------------------------------
    private static function get_bible_chapters()
    {
        $bookId = (int)self::$args['book_id'];
        $list = Info::get('db')->select(
            "SELECT DISTINCT CHAPTER_NUM
             FROM bible_verses
             WHERE BOOK_ID = {$bookId}
             ORDER BY CHAPTER_NUM"
        );
        return json_encode(array_map(function($row) {
            return (int)$row['CHAPTER_NUM'];
        }, $list));
    }

    // -----------------------------------------------------------
    // Get all verses for a book + chapter
    // Params: book_id, chapter_num
    // -----------------------------------------------------------
    private static function get_bible_verses()
    {
        // Support both book_id (old) and book_num (new) for backwards compatibility
        $langs = self::getBibleLanguages();

        if (isset(self::$args['book_num'])) {
            $bookNum    = (int)self::$args['book_num'];
            $chapterNum = (int)self::$args['chapter_num'];

            $cols = 'v.ID, v.VERSE_NUM, v.TEXT';
            foreach ($langs as $lang) {
                if ($lang['col_suffix'] !== '') {
                    $cols .= ', v.TEXT' . $lang['col_suffix'];
                }
            }

            $list = Info::get('db')->select(
                "SELECT {$cols}
                 FROM bible_verses v
                 JOIN bible_books b ON v.BOOK_ID = b.ID
                 WHERE b.BOOK_NUM = {$bookNum} AND v.CHAPTER_NUM = {$chapterNum}
                 ORDER BY v.VERSE_NUM
                 LIMIT 1000"
            );
        } else {
            // Fallback: book_id path with COALESCE fallback to translation 1
            $bookId     = (int)self::$args['book_id'];
            $chapterNum = (int)self::$args['chapter_num'];

            $cols = 'v.ID, v.VERSE_NUM, v.TEXT';
            foreach ($langs as $lang) {
                if ($lang['col_suffix'] !== '') {
                    $s    = $lang['col_suffix'];
                    $cols .= ", COALESCE(v.TEXT{$s}, v1.TEXT{$s}) AS TEXT{$s}";
                }
            }

            $list = Info::get('db')->select(
                "SELECT {$cols}
                 FROM bible_verses v
                 JOIN bible_books b ON b.ID = v.BOOK_ID
                 LEFT JOIN bible_books b1 ON b1.BOOK_NUM = b.BOOK_NUM AND b1.TRANSLATION_ID = 1
                 LEFT JOIN bible_verses v1 ON v1.BOOK_ID = b1.ID
                     AND v1.CHAPTER_NUM = v.CHAPTER_NUM
                     AND v1.VERSE_NUM = v.VERSE_NUM
                 WHERE v.BOOK_ID = {$bookId} AND v.CHAPTER_NUM = {$chapterNum}
                 ORDER BY v.VERSE_NUM"
            );
        }
        return json_encode($list);
    }

    // -----------------------------------------------------------
    // Search verses by text
    // Params: translation_id, query
    // -----------------------------------------------------------
    private static function search_bible_verses()
    {
        $translationId = (int)self::$args['translation_id'];
        $query = mysqli_escape_string(
            Info::get('dbh'),
            self::$args['query']
        );

        $langs     = self::getBibleLanguages();
        $textCols  = 'v.TEXT';
        $nameCols  = 'b.NAME as BOOK_NAME';
        $whereOrs  = ["v.TEXT LIKE '%{$query}%'"];

        foreach ($langs as $lang) {
            if ($lang['col_suffix'] !== '') {
                $s         = $lang['col_suffix'];
                $textCols .= ", COALESCE(v.TEXT{$s}, v1.TEXT{$s}) AS TEXT{$s}";
                $nameCols .= ", b.NAME{$s} as BOOK_NAME{$s}";
                $whereOrs[]= "COALESCE(v.TEXT{$s}, v1.TEXT{$s}) LIKE '%{$query}%'";
            }
        }
        $whereLangs = implode(' OR ', $whereOrs);

        $list = Info::get('db')->select(
            "SELECT v.ID, v.BOOK_ID, v.CHAPTER_NUM, v.VERSE_NUM,
                    {$textCols},
                    {$nameCols}
             FROM bible_verses v
             JOIN bible_books b ON b.ID = v.BOOK_ID
             LEFT JOIN bible_books b1 ON b1.BOOK_NUM = b.BOOK_NUM AND b1.TRANSLATION_ID = 1
             LEFT JOIN bible_verses v1 ON v1.BOOK_ID = b1.ID
                 AND v1.CHAPTER_NUM = v.CHAPTER_NUM
                 AND v1.VERSE_NUM = v.VERSE_NUM
             WHERE b.TRANSLATION_ID = {$translationId}
               AND ({$whereLangs})
             ORDER BY b.BOOK_NUM, v.CHAPTER_NUM, v.VERSE_NUM
             LIMIT 200"
        );
        return json_encode($list);
    }

    // -----------------------------------------------------------
    // Send a Bible verse to the display.
    // Unlike set_text (which does UPDATE by image_name),
    // this method does DELETE + INSERT so the row in current
    // is always created even if it did not exist yet.
    // Params: text, song_name
    // Empty text clears the display.
    // -----------------------------------------------------------
    private static function set_bible_text()
    {
        $userId    = (int)$_SESSION['curGroupId'];
        $text      = mysqli_escape_string(Info::get('dbh'), self::$args['text']);
        $song_name = mysqli_escape_string(Info::get('dbh'), self::$args['song_name']);
        $targetGroupId = isset(self::$args['target_group_id']) ? (int)self::$args['target_group_id'] : $userId;

        Info::get('db')->exec("DELETE FROM current WHERE groupId={$targetGroupId}");

        if ($text !== '') {
            Info::get('db')->exec(
                "INSERT INTO current (groupId, image, text, song_name)
                 VALUES ({$targetGroupId}, '__bible__', '{$text}', '{$song_name}')"
            );
        }

        self::updateSocket($targetGroupId);
        return '';
    }

    // Search messages by title and text
    private static function search_messages()
    {
        $dbh = Info::get('dbh');

        $titleQuery = isset(self::$args['title_query'])
            ? mysqli_real_escape_string($dbh, self::$args['title_query'])
            : '';
        $textQuery  = isset(self::$args['text_query'])
            ? mysqli_real_escape_string($dbh, self::$args['text_query'])
            : '';

        if ($titleQuery === '' && $textQuery === '') {
            return json_encode(array());
        }

        // Dependent search: when both queries are present the text search is
        // scoped to sermons that also match the title (AND), so the text field
        // searches only within the title-matched list. A single query applies
        // on its own.
        $conditions = array();
        if ($titleQuery !== '') {
            $conditions[] = "(TITLE LIKE '%{$titleQuery}%' OR CODE LIKE '%{$titleQuery}%')";
        }
        if ($textQuery !== '') {
            $conditions[] = "TEXT LIKE '%{$textQuery}%'";
        }
        $where = implode(' AND ', $conditions);

        $list = Info::get('db')->select(
            "SELECT ID, CODE, TITLE, CITY
         FROM messages
         WHERE {$where}
         ORDER BY TITLE
         LIMIT 100"
        );

        return json_encode($list);
    }

    // Quick paragraph results for the epistle text search: returns individual
    // matching paragraphs (as context snippets) across the messages matched by
    // the same dependent title+text scoping as search_messages. PARA_IDX is the
    // index among non-empty lines of TEXT and must stay in sync with how the
    // client builds messageParagraphs (split by newline, drop empty lines).
    private static function search_message_paragraphs()
    {
        $dbh = Info::get('dbh');

        $titleQuery = isset(self::$args['title_query'])
            ? mysqli_real_escape_string($dbh, self::$args['title_query'])
            : '';
        $rawText = isset(self::$args['text_query']) ? trim((string)self::$args['text_query']) : '';

        if (mb_strlen($rawText, 'UTF-8') < 2) {
            return json_encode(array());
        }
        $textQuery = mysqli_real_escape_string($dbh, $rawText);

        $conditions = array("TEXT LIKE '%{$textQuery}%'");
        if ($titleQuery !== '') {
            $conditions[] = "(TITLE LIKE '%{$titleQuery}%' OR CODE LIKE '%{$titleQuery}%')";
        }
        $where = implode(' AND ', $conditions);

        $list = Info::get('db')->select(
            "SELECT ID, CODE, TITLE, CITY, TEXT
             FROM messages
             WHERE {$where}
             ORDER BY TITLE
             LIMIT 20"
        );

        $results = array();
        foreach ($list as $msg) {
            $paraIdx = 0;
            foreach (preg_split('/\r?\n/', (string)$msg['TEXT']) as $para) {
                if (trim($para) === '') continue;
                $pos = mb_stripos($para, $rawText, 0, 'UTF-8');
                if ($pos !== false) {
                    // Context snippet around the first match
                    $start   = max(0, $pos - 40);
                    $snippet = mb_substr($para, $start, 180, 'UTF-8');
                    if ($start > 0) $snippet = '…' . $snippet;
                    if ($start + 180 < mb_strlen($para, 'UTF-8')) $snippet .= '…';
                    $results[] = array(
                        'ID'       => $msg['ID'],
                        'CODE'     => $msg['CODE'],
                        'TITLE'    => $msg['TITLE'],
                        'CITY'     => isset($msg['CITY']) ? $msg['CITY'] : '',
                        'PARA_IDX' => $paraIdx,
                        'SNIPPET'  => $snippet,
                    );
                    if (count($results) >= 50) break 2;
                }
                $paraIdx++;
            }
        }

        return json_encode($results);
    }

    // Get paragraphs of a single message
    private static function get_message()
    {
        $id = (int)self::$args['id'];
        $list = Info::get('db')->select(
            "SELECT ID, CODE, TITLE, CITY, " . self::textColumnList() . ", AUDIO_SRC, TIMECODES
             FROM messages WHERE ID = {$id} LIMIT 1"
        );
        return json_encode(count($list) > 0 ? $list[0] : null);
    }

    // Show a message paragraph on the text display
    private static function set_message_text()
    {
        $userId = (int)$_SESSION['curGroupId'];
        $dbh = Info::get('dbh');
        $text = mysqli_real_escape_string($dbh, self::$args['text']);
        $song_name = mysqli_real_escape_string($dbh, self::$args['song_name']);
        $targetGroupId = self::resolveDisplayTarget($userId);
        if ($targetGroupId === null) {
            return ''; // broadcast disabled for this channel — leave screens alone
        }

        Info::get('db')->exec("DELETE FROM current WHERE groupId={$targetGroupId}");

        if ($text !== '') {
            Info::get('db')->exec(
                "INSERT INTO current (groupId, image, text, song_name, chapter_indices, video_src, video_state)
                 VALUES ({$targetGroupId}, '__bible__', '{$text}', '{$song_name}', '', '', 'stopped')"
            );
        }

        self::updateSocket($targetGroupId);
        return '';
    }

    // Save calibrated timecodes for a message
    private static function save_message_timecodes()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }
        $id = (int)(self::$args['id'] ?? 0);
        if (!$id) {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.noMessageId')]);
        }
        $timecodes    = self::$args['timecodes'] ?? '';
        $dbh          = Info::get('dbh');
        $timecodesEsc = mysqli_real_escape_string($dbh, $timecodes);
        Info::get('db')->exec("UPDATE messages SET TIMECODES='{$timecodesEsc}' WHERE ID={$id}");
        return json_encode(['status' => 'success']);
    }

    /**
     * Add a media file to the tech playlist.
     * Params: name, src, media_type ('image'|'video')
     */
    private static function add_media_to_favorites()
    {
        $dbh       = Info::get('dbh');
        $userId    = (int)$_SESSION['curGroupId'];
        $name      = mysqli_real_escape_string($dbh, self::$args['name']       ?? '');
        $src       = mysqli_real_escape_string($dbh, self::$args['src']        ?? '');
        $mediaType = mysqli_real_escape_string($dbh, self::$args['media_type'] ?? 'image');

        if (!in_array($mediaType, ['image', 'video'])) $mediaType = 'image';
        if (empty($src)) return json_encode(['status' => 'error', 'message' => 'Empty src']);

        $maxSong  = Info::get('db')->get(
            "SELECT IFNULL(MAX(sort_order), 0) AS m FROM favorites WHERE groupId = {$userId}"
        );
        $maxMedia = Info::get('db')->get(
            "SELECT IFNULL(MAX(sort_order), 0) AS m FROM tech_media_favorites WHERE group_id = {$userId}"
        );
        $sortOrder = max((int)$maxSong['m'], (int)$maxMedia['m']) + 1;

        Info::get('db')->exec(
            "INSERT INTO tech_media_favorites (group_id, name, src, media_type, sort_order)
         VALUES ({$userId}, '{$name}', '{$src}', '{$mediaType}', {$sortOrder})"
        );
        self::updateSocket();
        return json_encode(['status' => 'ok', 'id' => Info::get('dbh')->insert_id]);
    }

    /**
     * Remove a media file from the playlist.
     * Params: id
     */
    private static function delete_media_favorite()
    {
        $userId = (int)$_SESSION['curGroupId'];
        $id     = (int)self::$args['id'];

        // Get media info before deleting
        $media = Info::get('db')->get(
            "SELECT src, media_type FROM tech_media_favorites WHERE id = {$id} AND group_id = {$userId}"
        );

        // Delete from database
        Info::get('db')->exec(
            "DELETE FROM tech_media_favorites WHERE id = {$id} AND group_id = {$userId}"
        );

        // Delete the physical file if it's an uploaded file (starts with /tech_media/)
        // BUT only if it's NOT used in standard wallpapers
        if ($media && isset($media['src']) && strpos($media['src'], '/tech_media/') === 0) {
            // Check if this image is referenced in standard wallpapers
            $dbh = Info::get('dbh');
            $srcSafe = mysqli_real_escape_string($dbh, $media['src']);
            $inWallpapers = Info::get('db')->get(
                "SELECT id FROM standard_wallpapers WHERE src = '{$srcSafe}'"
            );

            // Delete the file only if it is not used in standard wallpapers
            if (!$inWallpapers) {
                $filePath = __DIR__ . '/../public' . $media['src'];
                if (file_exists($filePath)) {
                    unlink($filePath);
                }
            }
        }

        self::updateSocket();
        return json_encode(['status' => 'ok']);
    }

    /**
     * Upload a media image and add it to the playlist.
     * Input: multipart file 'file', optional 'name'
     */
    private static function upload_media_image()
    {
        $userId = (int)$_SESSION['curGroupId'];

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            return json_encode(['status' => 'error', 'message' => 'Upload error']);
        }

        // [SECURITY #5] Validate file extension
        $ext         = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));
        $allowedExt  = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        if (!in_array($ext, $allowedExt, true)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid image type: ' . $ext]);
        }

        // [SECURITY #5] Validate actual MIME type
        $allowedMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!self::checkMime($_FILES['file']['tmp_name'], $allowedMime)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid file type (MIME mismatch)']);
        }

        $dir = __DIR__ . '/../public/tech_media/' . $userId . '/';
        if (!file_exists($dir) && !mkdir($dir, 0755, true)) {
            return json_encode(['status' => 'error', 'message' => 'Cannot create dir']);
        }

        $filename = uniqid('img_', true) . '.' . $ext;
        if (!move_uploaded_file($_FILES['file']['tmp_name'], $dir . $filename)) {
            return json_encode(['status' => 'error', 'message' => 'move failed']);
        }

        $path = '/tech_media/' . $userId . '/' . $filename;
        // Use provided name or fall back to the original filename
        $name = isset($_POST['name']) && !empty($_POST['name']) ? $_POST['name'] : $_FILES['file']['name'];

        $dbh      = Info::get('dbh');
        $nameSafe = mysqli_real_escape_string($dbh, $name);
        $pathSafe = mysqli_real_escape_string($dbh, $path);

        $maxSong  = Info::get('db')->get("SELECT IFNULL(MAX(sort_order),0) AS m FROM favorites WHERE groupId={$userId}");
        $maxMedia = Info::get('db')->get("SELECT IFNULL(MAX(sort_order),0) AS m FROM tech_media_favorites WHERE group_id={$userId}");
        $sortOrder = max((int)$maxSong['m'], (int)$maxMedia['m']) + 1;

        Info::get('db')->exec(
            "INSERT INTO tech_media_favorites (group_id, name, src, media_type, sort_order)
             VALUES ({$userId}, '{$nameSafe}', '{$pathSafe}', 'image', {$sortOrder})"
        );
        self::updateSocket();
        return json_encode(['status' => 'success', 'path' => $path, 'name' => $name]);
    }

    /**
     * Upload a video file and add it to the playlist.
     * Input: multipart file 'file', optional 'name'
     */
    private static function upload_media_video()
    {
        $userId = (int)$_SESSION['curGroupId'];

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            return json_encode(['status' => 'error', 'message' => 'Upload error']);
        }

        // [SECURITY #5] Validate file extension
        $ext         = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));
        $allowedExt  = ['mp4', 'webm', 'ogg', 'mov', 'avi'];
        if (!in_array($ext, $allowedExt, true)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid video type: ' . $ext]);
        }

        // [SECURITY #5] Validate actual MIME type
        $allowedMime = [
            'video/mp4', 'video/webm', 'video/ogg',
            'video/quicktime', 'video/x-msvideo',
            'application/octet-stream',
        ];
        if (!self::checkMime($_FILES['file']['tmp_name'], $allowedMime)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid file type (MIME mismatch)']);
        }

        $dir = __DIR__ . '/../public/tech_media/' . $userId . '/';
        if (!file_exists($dir) && !mkdir($dir, 0755, true)) {
            return json_encode(['status' => 'error', 'message' => 'Cannot create dir']);
        }

        $filename = uniqid('vid_', true) . '.' . $ext;
        if (!move_uploaded_file($_FILES['file']['tmp_name'], $dir . $filename)) {
            return json_encode(['status' => 'error', 'message' => 'move failed']);
        }

        $path = '/tech_media/' . $userId . '/' . $filename;
        // Use provided name or fall back to the original filename
        $name = isset($_POST['name']) && !empty($_POST['name']) ? $_POST['name'] : $_FILES['file']['name'];

        $dbh      = Info::get('dbh');
        $nameSafe = mysqli_real_escape_string($dbh, $name);
        $pathSafe = mysqli_real_escape_string($dbh, $path);

        $maxSong  = Info::get('db')->get("SELECT IFNULL(MAX(sort_order),0) AS m FROM favorites WHERE groupId={$userId}");
        $maxMedia = Info::get('db')->get("SELECT IFNULL(MAX(sort_order),0) AS m FROM tech_media_favorites WHERE group_id={$userId}");
        $sortOrder = max((int)$maxSong['m'], (int)$maxMedia['m']) + 1;

        Info::get('db')->exec(
            "INSERT INTO tech_media_favorites (group_id, name, src, media_type, sort_order)
             VALUES ({$userId}, '{$nameSafe}', '{$pathSafe}', 'video', {$sortOrder})"
        );
        self::updateSocket();
        return json_encode(['status' => 'success', 'path' => $path, 'name' => $name]);
    }

    /**
     * Send a video to the text display.
     * Params: video_src (string), video_state ('playing'|'paused'|'stopped')
     */
    private static function set_video()
    {
        $dbh        = Info::get('dbh');
        $userId     = (int)$_SESSION['curGroupId'];
        $videoSrc   = mysqli_real_escape_string($dbh, self::$args['video_src']   ?? '');
        $videoState = mysqli_real_escape_string($dbh, self::$args['video_state'] ?? 'playing');
        $targetGroupId = self::resolveDisplayTarget($userId);
        if ($targetGroupId === null) {
            return json_encode(['status' => 'ok']); // broadcast disabled — no-op
        }

        Info::get('db')->exec("DELETE FROM current WHERE groupId = {$targetGroupId}");
        Info::get('db')->exec(
            "INSERT INTO current (groupId, image, text, song_name, video_src, video_state)
         VALUES ({$targetGroupId}, '', '', '', '{$videoSrc}', '{$videoState}')"
        );
        self::updateSocket($targetGroupId);
        return json_encode(['status' => 'ok']);
    }

    /**
     * Control playback without changing the video source.
     * Params: video_state ('playing'|'paused'|'stopped')
     */
    private static function video_control()
    {
        $dbh        = Info::get('dbh');
        $userId     = (int)$_SESSION['curGroupId'];
        $videoState = mysqli_real_escape_string($dbh, self::$args['video_state'] ?? 'stopped');
        $targetGroupId = self::resolveDisplayTarget($userId);
        if ($targetGroupId === null) {
            return json_encode(['status' => 'ok']); // broadcast disabled — no-op
        }

        $row = Info::get('db')->get("SELECT groupId FROM current WHERE groupId = {$targetGroupId}");
        if ($row) {
            Info::get('db')->exec(
                "UPDATE current SET video_state = '{$videoState}' WHERE groupId = {$targetGroupId}"
            );
        }
        self::updateSocket($targetGroupId);
        return json_encode(['status' => 'ok']);
    }

    /**
     * Show a sermon slide on the main display.
     * Params: html (slide HTML content), title (slide title), target_group_id
     */
    private static function set_slide()
    {
        $dbh           = Info::get('dbh');
        $userId        = (int)$_SESSION['curGroupId'];
        $targetGroupId = self::resolveDisplayTarget($userId);
        if ($targetGroupId === null) {
            return json_encode(['status' => 'ok']); // broadcast disabled — no-op
        }

        // Basic sanitization: strip script/iframe tags and potentially dangerous attributes
        $html = self::$args['html'] ?? '';
        $html = preg_replace('/<script\b[^>]*>.*?<\/script>/is', '', $html);
        $html = preg_replace('/<iframe\b[^>]*>.*?<\/iframe>/is', '', $html);
        $html = preg_replace('/\bon\w+\s*=/i', 'data-blocked=', $html);
        // Strip 4-byte UTF-8 characters (emoji etc.) — current table uses utf8 (3-byte)
        $html = preg_replace('/[\x{10000}-\x{10FFFF}]/u', '', $html);
        $html = mysqli_real_escape_string($dbh, $html);

        // bg_color stored in song_name column (repurposed for slides)
        $bgColor = preg_replace('/[^#0-9a-fA-F]/', '', self::$args['bg_color'] ?? '#1a237e');
        if (empty($bgColor)) $bgColor = '#1a237e';

        $db  = Info::get('db');
        $dbh = Info::get('dbh');

        $db->exec("DELETE FROM current WHERE groupId = {$targetGroupId}");

        $sql = "INSERT INTO current (groupId, image, text, song_name, chapter_indices, video_src, video_state)"
             . " VALUES ({$targetGroupId}, '__slide__', '{$html}', '{$bgColor}', '', '', 'stopped')";

        $ok = $dbh->query($sql);
        if (!$ok) {
            error_log('set_slide INSERT error: ' . $dbh->error);
            return json_encode(['status' => 'error', 'message' => $dbh->error]);
        }

        self::updateSocket($targetGroupId);
        return json_encode(['status' => 'ok']);
    }

    /**
     * Get the list of standard wallpapers.
     * Returns: {status, wallpapers: [{id, name, src}], is_admin}
     */
    private static function get_standard_wallpapers()
    {
        $isAdmin = Security::isAdmin() || Security::isLeader();

        $wallpapers = Info::get('db')->select(
            "SELECT id, name, src FROM standard_wallpapers ORDER BY id DESC"
        );

        return json_encode([
            'status' => 'success',
            'wallpapers' => $wallpapers,
            'is_admin' => $isAdmin
        ]);
    }

    /**
     * Add an image to standard wallpapers.
     * Params: name, src
     */
    private static function add_to_wallpapers()
    {
        $dbh  = Info::get('dbh');
        $name = mysqli_real_escape_string($dbh, self::$args['name'] ?? '');
        $src  = mysqli_real_escape_string($dbh, self::$args['src']  ?? '');

        if (empty($name) || empty($src)) {
            return json_encode(['status' => 'error', 'message' => 'Name and src required']);
        }

        // Only admin or leader may perform this action
        if (!Security::isAdmin() && !Security::isLeader()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }

        // Check for duplicates
        $exists = Info::get('db')->get(
            "SELECT id FROM standard_wallpapers WHERE src = '{$src}'"
        );
        if ($exists) {
            return json_encode(['status' => 'error', 'message' => 'This wallpaper already exists']);
        }

        Info::get('db')->exec(
            "INSERT INTO standard_wallpapers (name, src) VALUES ('{$name}', '{$src}')"
        );

        return json_encode(['status' => 'success', 'id' => Info::get('dbh')->insert_id]);
    }

    /**
     * Remove a wallpaper from the standard list (admin or leader only).
     * Params: id
     */
    private static function delete_wallpaper()
    {
        $id = (int)self::$args['id'];

        // Only admin or leader may perform this action
        if (!Security::isAdmin() && !Security::isLeader()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }

        Info::get('db')->exec("DELETE FROM standard_wallpapers WHERE id = {$id}");

        return json_encode(['status' => 'success']);
    }
}
