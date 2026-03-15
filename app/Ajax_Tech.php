<?php

/**
 * Tech page Ajax methods
 * Handles Bible, messages, media, video controls
 */
trait Ajax_Tech
{
    private static function get_current_state()
    {
        $userId = (int)$_SESSION['userId'];
        $row = Info::get('db')->get("SELECT image, text, song_name, chapter_indices, video_src FROM current WHERE groupId = {$userId}");

        if (!$row) {
            return json_encode(['image' => '', 'text' => '', 'song_name' => '', 'chapter_indices' => '', 'video_src' => '']);
        }

        return json_encode($row);
    }

    private static function set_tech_image()
    {
        $dbh        = Info::get('dbh');
        $userId     = (int)$_SESSION['userId'];
        $image_name = mysqli_real_escape_string($dbh, self::$args['image_name'] ?? '');
        $targetGroupId = isset(self::$args['target_group_id']) ? (int)self::$args['target_group_id'] : $userId;

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
        $userId     = (int)$_SESSION['userId'];
        $text       = mysqli_real_escape_string($dbh, self::$args['text']       ?? '');
        $image_name = mysqli_real_escape_string($dbh, self::$args['image_name'] ?? '');
        $song_name  = mysqli_real_escape_string($dbh, self::$args['song_name']  ?? '');
        $chapter_indices = mysqli_real_escape_string($dbh, self::$args['chapter_indices'] ?? '');

        Info::get('db')->exec(
            "UPDATE current
             SET text='{$text}', song_name='{$song_name}', chapter_indices='{$chapter_indices}'
             WHERE groupId={$userId} AND image='{$image_name}'"
        );
        self::updateSocket();
        return '';
    }

    // -----------------------------------------------------------
    // Получить все переводы Библии
    // -----------------------------------------------------------
    private static function get_bible_translations()
    {
        $list = Info::get('db')->select(
            "SELECT ID, NAME, LANG FROM bible_translations ORDER BY SORT_ORDER, ID"
        );
        return json_encode($list);
    }

    // -----------------------------------------------------------
    // Получить все книги для указанного перевода
    // Параметры: translation_id
    // -----------------------------------------------------------
    private static function get_bible_books()
    {
        $translationId = (int)self::$args['translation_id'];
        $list = Info::get('db')->select(
            "SELECT ID, BOOK_NUM, NAME, NAME_LT, NAME_EN
             FROM bible_books
             WHERE TRANSLATION_ID = {$translationId}
             ORDER BY BOOK_NUM"
        );
        return json_encode($list);
    }

    // -----------------------------------------------------------
    // Получить номера глав для книги
    // Параметры: book_id
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
    // Получить все стихи для книги + главы
    // Параметры: book_id, chapter_num
    // -----------------------------------------------------------
    private static function get_bible_verses()
    {
        // Support both book_id (old) and book_num (new) for backwards compatibility
        if (isset(self::$args['book_num'])) {
            $bookNum = (int)self::$args['book_num'];
            $chapterNum = (int)self::$args['chapter_num'];
            $list = Info::get('db')->select(
                "SELECT v.ID, v.VERSE_NUM, v.TEXT, v.TEXT_LT, v.TEXT_EN
                 FROM bible_verses v
                 JOIN bible_books b ON v.BOOK_ID = b.ID
                 WHERE b.BOOK_NUM = {$bookNum} AND v.CHAPTER_NUM = {$chapterNum}
                 ORDER BY v.VERSE_NUM
                 LIMIT 1000"
            );
        } else {
            // Fallback to old book_id method
            $bookId = (int)self::$args['book_id'];
            $chapterNum = (int)self::$args['chapter_num'];
            $list = Info::get('db')->select(
                "SELECT ID, VERSE_NUM, TEXT, TEXT_LT, TEXT_EN
                 FROM bible_verses
                 WHERE BOOK_ID = {$bookId} AND CHAPTER_NUM = {$chapterNum}
                 ORDER BY VERSE_NUM"
            );
        }
        return json_encode($list);
    }

    // -----------------------------------------------------------
    // Поиск стихов по тексту
    // Параметры: translation_id, query
    // -----------------------------------------------------------
    private static function search_bible_verses()
    {
        $translationId = (int)self::$args['translation_id'];
        $query = mysqli_escape_string(
            Info::get('dbh'),
            self::$args['query']
        );

        $list = Info::get('db')->select(
            "SELECT v.ID, v.BOOK_ID, v.CHAPTER_NUM, v.VERSE_NUM,
                    v.TEXT, v.TEXT_LT, v.TEXT_EN,
                    b.NAME as BOOK_NAME, b.NAME_LT as BOOK_NAME_LT, b.NAME_EN as BOOK_NAME_EN
             FROM bible_verses v
             JOIN bible_books b ON b.ID = v.BOOK_ID
             WHERE b.TRANSLATION_ID = {$translationId}
               AND (v.TEXT LIKE '%{$query}%'
                    OR v.TEXT_LT LIKE '%{$query}%'
                    OR v.TEXT_EN LIKE '%{$query}%')
             ORDER BY b.BOOK_NUM, v.CHAPTER_NUM, v.VERSE_NUM
             LIMIT 200"
        );
        return json_encode($list);
    }

    // -----------------------------------------------------------
    // Отправить стих Библии на экран.
    // В отличие от set_text (который делает UPDATE по image_name),
    // этот метод делает DELETE + INSERT — строка в current всегда
    // будет создана, даже если её ещё нет.
    // Параметры: text, song_name
    // При пустом text — просто очищает экран.
    // -----------------------------------------------------------
    private static function set_bible_text()
    {
        $userId    = (int)$_SESSION['userId'];
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

    // Поиск посланий по названию и тексту
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

        $conditions = array();
        if ($titleQuery !== '') {
            $conditions[] = "(TITLE LIKE '%{$titleQuery}%' OR CODE LIKE '%{$titleQuery}%')";
        }
        if ($textQuery !== '') {
            $conditions[] = "TEXT LIKE '%{$textQuery}%'";
        }
        $where = implode(' OR ', $conditions);

        $list = Info::get('db')->select(
            "SELECT ID, CODE, TITLE, CITY
         FROM messages
         WHERE {$where}
         ORDER BY TITLE
         LIMIT 100"
        );

        return json_encode($list);
    }

    // Получить абзацы одного послания
    private static function get_message()
    {
        $id = (int)self::$args['id'];
        $list = Info::get('db')->select(
            "SELECT ID, CODE, TITLE, CITY, TEXT
             FROM messages WHERE ID = {$id} LIMIT 1"
        );
        return json_encode(count($list) > 0 ? $list[0] : null);
    }

    // Показать абзац послания на экране текста
    private static function set_message_text()
    {
        $userId = (int)$_SESSION['userId'];
        $dbh = Info::get('dbh');
        $text = mysqli_real_escape_string($dbh, self::$args['text']);
        $song_name = mysqli_real_escape_string($dbh, self::$args['song_name']);
        $targetGroupId = isset(self::$args['target_group_id']) ? (int)self::$args['target_group_id'] : $userId;

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

    /**
     * Добавить медиафайл в плейлист техника.
     * Params: name, src, media_type ('image'|'video')
     */
    private static function add_media_to_favorites()
    {
        $dbh       = Info::get('dbh');
        $userId    = (int)$_SESSION['userId'];
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
     * Удалить медиафайл из плейлиста.
     * Params: id
     */
    private static function delete_media_favorite()
    {
        $userId = (int)$_SESSION['userId'];
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
        if ($media && isset($media['src']) && strpos($media['src'], '/tech_media/') === 0) {
            $filePath = __DIR__ . '/../public' . $media['src'];
            if (file_exists($filePath)) {
                unlink($filePath);
            }
        }

        self::updateSocket();
        return json_encode(['status' => 'ok']);
    }

    /**
     * Загрузить медиа-изображение и добавить в плейлист.
     * Input: multipart file 'file'
     */
    private static function upload_media_image()
    {
        $userId = (int)$_SESSION['userId'];

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            return json_encode(['status' => 'error', 'message' => 'Upload error']);
        }

        // [SECURITY #5] Проверка расширения
        $ext         = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));
        $allowedExt  = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        if (!in_array($ext, $allowedExt, true)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid image type: ' . $ext]);
        }

        // [SECURITY #5] Проверка реального MIME-типа
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
        $name = $_FILES['file']['name'];

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
     * Загрузить видеофайл и добавить в плейлист.
     * Input: multipart file 'file'
     */
    private static function upload_media_video()
    {
        $userId = (int)$_SESSION['userId'];

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            return json_encode(['status' => 'error', 'message' => 'Upload error']);
        }

        // [SECURITY #5] Проверка расширения
        $ext         = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));
        $allowedExt  = ['mp4', 'webm', 'ogg', 'mov', 'avi'];
        if (!in_array($ext, $allowedExt, true)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid video type: ' . $ext]);
        }

        // [SECURITY #5] Проверка реального MIME-типа
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
        $name = $_FILES['file']['name'];

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
     * Отправить видео на текстовый дисплей.
     * Params: video_src (string), video_state ('playing'|'paused'|'stopped')
     */
    private static function set_video()
    {
        $dbh        = Info::get('dbh');
        $userId     = (int)$_SESSION['userId'];
        $videoSrc   = mysqli_real_escape_string($dbh, self::$args['video_src']   ?? '');
        $videoState = mysqli_real_escape_string($dbh, self::$args['video_state'] ?? 'playing');
        $targetGroupId = isset(self::$args['target_group_id']) ? (int)self::$args['target_group_id'] : $userId;

        Info::get('db')->exec("DELETE FROM current WHERE groupId = {$targetGroupId}");
        Info::get('db')->exec(
            "INSERT INTO current (groupId, image, text, song_name, video_src, video_state)
         VALUES ({$targetGroupId}, '', '', '', '{$videoSrc}', '{$videoState}')"
        );
        self::updateSocket($targetGroupId);
        return json_encode(['status' => 'ok']);
    }

    /**
     * Управление воспроизведением (без смены источника).
     * Params: video_state ('playing'|'paused'|'stopped')
     */
    private static function video_control()
    {
        $dbh        = Info::get('dbh');
        $userId     = (int)$_SESSION['userId'];
        $videoState = mysqli_real_escape_string($dbh, self::$args['video_state'] ?? 'stopped');
        $targetGroupId = isset(self::$args['target_group_id']) ? (int)self::$args['target_group_id'] : $userId;

        $row = Info::get('db')->get("SELECT groupId FROM current WHERE groupId = {$targetGroupId}");
        if ($row) {
            Info::get('db')->exec(
                "UPDATE current SET video_state = '{$videoState}' WHERE groupId = {$targetGroupId}"
            );
        }
        self::updateSocket($targetGroupId);
        return json_encode(['status' => 'ok']);
    }
}
