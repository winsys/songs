<?php

class Ajax
{
    private static $args;

    private static function get_song_list()
    {
        $listId = (int)self::$args['list_id'];
        $list = Info::get('db')->select(
            "SELECT l.*,
                    concat(l.NUM, '   ', l.NAME) as dispName,
                    n.LIST_NAME as bookName,
                    (l.TEXT    IS NOT NULL AND l.TEXT    != '') AS hasTextRu,
                    (l.TEXT_LT IS NOT NULL AND l.TEXT_LT != '') AS hasTextLt,
                    (l.TEXT_EN IS NOT NULL AND l.TEXT_EN != '') AS hasTextEn
             FROM song_list l
             LEFT JOIN list_names n ON n.LIST_ID = l.LISTID
             WHERE l.LISTID = {$listId}
             ORDER BY l.NUM"
        );
        return json_encode($list);
    }

    private static function add_to_favorites()
    {
        Info::get('db')->exec("insert into favorites (groupId, SONGID) values ({$_SESSION['userId']},".mysqli_escape_string(Info::get('dbh'), self::$args['id']).")");
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
        $userId = $_SESSION['userId'];

        // Get user settings for favorites order
        $settings = Info::get('db')->get("SELECT favorites_order FROM user_settings WHERE user_id = {$userId}");
        $order = ($settings && $settings['favorites_order'] === 'latest_top') ? 'DESC' : 'ASC';

        $sql = "SELECT f.ID as FID, l.*, concat(l.num, ' - ',l.name) as dispName, n.LIST_NAME as bookName,
                        concat('/images/',l.LISTID,'/',l.num,'.jpg') as imageName, f.SONGID, l.TEXT, l.TEXT_LT, l.TEXT_EN FROM favorites f
                left join song_list l ON l.ID=f.SONGID
                left join list_names n ON n.LIST_ID=l.LISTID
                where f.groupId={$userId}
                ORDER BY FID {$order}";

        $list = Info::get('db')->select($sql);
        return json_encode($list);
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
        Info::get('db')->exec("insert into current (groupId, image) values ({$_SESSION['userId']}, '/images/".
            mysqli_escape_string(Info::get('dbh'), self::$args['list_id'])."/".
            mysqli_escape_string(Info::get('dbh'), self::$args['image_num']).".jpg')");
        self::updateSocket();
        return '';
    }

    private static function get_image()
    {
        $userId = $_SESSION['userId'];
        $img = Info::get('db')->select("select image, text, song_name from current where groupId=".$userId);

        // Get user settings
        $settings = Info::get('db')->get("SELECT * FROM user_settings WHERE user_id = {$userId}");

        // Add settings to response
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

    private static function set_tech_image()
    {
        $image_name = self::$args['image_name'];
        Info::get('db')->exec("delete from current where groupId=".$_SESSION['userId']);
        Info::get('db')->exec("insert into current (groupId, image) 
                                values ({$_SESSION['userId']}, \"{$image_name}\")");
        self::updateSocket();
        return '';
    }

    private static function set_text()
    {
        $text = mysqli_escape_string(Info::get('dbh'), self::$args['text']);
        $image_name = self::$args['image_name'];
        $song_name = self::$args['song_name'];
        Info::get('db')->exec("update current set text=\"{$text}\", song_name=\"{$song_name}\" WHERE groupId={$_SESSION['userId']} and image=\"{$image_name}\"");
        self::updateSocket();
        return '';
    }


    private static function clear_image()
    {
        Info::get('db')->exec("delete from current where groupId=".$_SESSION['userId']);
        self::updateSocket();
        return '';
    }


    /**
     * AJAX ENGINE
     */
    public static function execute($cmd)
    {
        $command = $cmd['command'];
        if( !isset($_SESSION['userId']) ){
            return json_encode(array('status'=>false, 'message'=>'User not logged in!'));
        }

        if (is_callable(array('Ajax', $command))){
            self::$args = $cmd;
            $data = self::$command();
            return $data;
        }else{
            return json_encode(array('status'=>false, 'message'=>Info::get('db')->errors()));
        }
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
        // Log for debugging
        error_log("upload_song_image called");
        error_log("POST data: " . print_r($_POST, true));
        error_log("FILES data: " . print_r($_FILES, true));

        if (!isset($_POST['song_id'])) {
            return json_encode(['status' => 'error', 'message' => 'No song_id provided']);
        }

        $songId = mysqli_escape_string(Info::get('dbh'), $_POST['song_id']);

        // Get song details for proper path
        $song = Info::get('db')->get("SELECT LISTID, NUM FROM song_list WHERE ID = {$songId}");

        if (!$song) {
            return json_encode(['status' => 'error', 'message' => 'Song not found']);
        }
        
        if (isset($_FILES['image']) && $_FILES['image']['error'] == 0) {
            $uploadDir = __DIR__ . '/../public/images/' . $song['LISTID'] . '/';
            
            if (!file_exists($uploadDir)) {
                mkdir($uploadDir, 0777, true);
            }

            // Ensure UTF-8 encoding for filename with Cyrillic characters
            $filename = $song['NUM'] . '.jpg';

            // Convert to UTF-8 if needed
            if (mb_detect_encoding($filename, 'UTF-8', true) === false) {
                $filename = mb_convert_encoding($filename, 'UTF-8');
            }

            $targetFile = $uploadDir . $filename;

            error_log("Attempting to save file to: " . $targetFile);

            if (move_uploaded_file($_FILES['image']['tmp_name'], $targetFile)) {
                error_log("File uploaded successfully");
                self::updateSocket();
                return json_encode([
                    'status' => 'success',
                    'path' => '/images/' . $song['LISTID'] . '/' . $filename
                ]);
            } else {
                error_log("move_uploaded_file failed");
                return json_encode(['status' => 'error', 'message' => 'Failed to move uploaded file']);
            }
        }

        $errorMsg = 'Upload failed';
        if (isset($_FILES['image'])) {
            $errorMsg .= ' - Error code: ' . $_FILES['image']['error'];
        } else {
            $errorMsg .= ' - No file received';
        }

        error_log($errorMsg);
        return json_encode(['status' => 'error', 'message' => $errorMsg]);
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
        $bookId     = (int)self::$args['book_id'];
        $chapterNum = (int)self::$args['chapter_num'];
        $list = Info::get('db')->select(
            "SELECT ID, VERSE_NUM, TEXT, TEXT_LT, TEXT_EN
             FROM bible_verses
             WHERE BOOK_ID = {$bookId} AND CHAPTER_NUM = {$chapterNum}
             ORDER BY VERSE_NUM"
        );
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

        Info::get('db')->exec("DELETE FROM current WHERE groupId={$userId}");

        if ($text !== '') {
            Info::get('db')->exec(
                "INSERT INTO current (groupId, image, text, song_name)
                 VALUES ({$userId}, '__bible__', '{$text}', '{$song_name}')"
            );
        }

        self::updateSocket();
        return '';
    }

    /**
     * ============================================================
     * ИНСТРУКЦИЯ: Вставить методы ниже в app/Ajax.php
     * ПЕРЕД методом updateSocket().
     * ============================================================
     */

    private static function get_sermon_list()
    {
        $userId = (int)$_SESSION['userId'];
        $list = Info::get('db')->select(
            "SELECT ID, TITLE, SERMON_DATE, UPDATED_AT
             FROM sermons
             WHERE USER_ID = {$userId}
             ORDER BY SERMON_DATE DESC, UPDATED_AT DESC"
        );
        return json_encode($list);
    }

    private static function get_sermon()
    {
        $userId   = (int)$_SESSION['userId'];
        $sermonId = (int)self::$args['id'];
        $list = Info::get('db')->select(
            "SELECT ID, TITLE, SERMON_DATE, CONTENT
             FROM sermons
             WHERE ID = {$sermonId} AND USER_ID = {$userId}
             LIMIT 1"
        );
        return json_encode(count($list) > 0 ? $list[0] : null);
    }

    private static function save_sermon()
    {
        $userId = (int)$_SESSION['userId'];
        $dbh    = Info::get('dbh');

        $sermonId = isset(self::$args['id']) ? (int)self::$args['id'] : 0;
        $title    = isset(self::$args['title'])   ? mysqli_real_escape_string($dbh, self::$args['title'])   : '';
        $date     = isset(self::$args['date'])    ? mysqli_real_escape_string($dbh, self::$args['date'])    : '';
        $content  = isset(self::$args['content']) ? mysqli_real_escape_string($dbh, self::$args['content']) : '';

        $dateVal = ($date !== '') ? "'{$date}'" : 'NULL';

        if ($sermonId > 0) {
            $existing = Info::get('db')->select(
                "SELECT ID FROM sermons WHERE ID = {$sermonId} AND USER_ID = {$userId} LIMIT 1"
            );
            if (count($existing) > 0) {
                $dbh->query(
                    "UPDATE sermons
                     SET TITLE = '{$title}', SERMON_DATE = {$dateVal}, CONTENT = '{$content}'
                     WHERE ID = {$sermonId} AND USER_ID = {$userId}"
                );
                $err = $dbh->error;
                if ($err) {
                    error_log("save_sermon UPDATE error: " . $err);
                    return json_encode(array('status' => 'error', 'message' => $err));
                }
                return json_encode(array('id' => $sermonId, 'status' => 'ok'));
            }
        }

        $dbh->query(
            "INSERT INTO sermons (USER_ID, TITLE, SERMON_DATE, CONTENT)
             VALUES ({$userId}, '{$title}', {$dateVal}, '{$content}')"
        );
        $err = $dbh->error;
        if ($err) {
            error_log("save_sermon INSERT error: " . $err);
            return json_encode(array('status' => 'error', 'message' => $err));
        }
        $newId = $dbh->insert_id;
        return json_encode(array('id' => $newId, 'status' => 'ok'));
    }

    private static function delete_sermon()
    {
        $userId   = (int)$_SESSION['userId'];
        $sermonId = (int)self::$args['id'];
        Info::get('db')->exec(
            "DELETE FROM sermons WHERE ID = {$sermonId} AND USER_ID = {$userId}"
        );
        return json_encode(array('status' => 'ok'));
    }

    private static function upload_sermon_image()
    {
        $userId = (int)$_SESSION['userId'];

        if (!isset($_FILES['image'])) {
            return json_encode(array('status' => 'error', 'message' => 'No file in $_FILES["image"]'));
        }
        if ($_FILES['image']['error'] !== UPLOAD_ERR_OK) {
            $codes = array(
                1 => 'File too large (php.ini)',
                2 => 'File too large (form)',
                3 => 'Partial upload',
                4 => 'No file uploaded',
                6 => 'No tmp dir',
                7 => 'Cannot write to disk',
                8 => 'Blocked by extension',
            );
            $code = $_FILES['image']['error'];
            $msg  = isset($codes[$code]) ? $codes[$code] : 'Error code ' . $code;
            return json_encode(array('status' => 'error', 'message' => $msg));
        }

        $ext     = strtolower(pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION));
        $allowed = array('jpg', 'jpeg', 'png', 'gif', 'webp');
        if (!in_array($ext, $allowed)) {
            return json_encode(array('status' => 'error', 'message' => 'Invalid file type: ' . $ext));
        }

        $uploadDir = __DIR__ . '/../public/sermon_images/' . $userId . '/';
        if (!file_exists($uploadDir)) {
            if (!mkdir($uploadDir, 0777, true)) {
                return json_encode(array('status' => 'error', 'message' => 'Cannot create dir'));
            }
        }

        $filename   = uniqid('img_', true) . '.' . $ext;
        $targetFile = $uploadDir . $filename;

        if (move_uploaded_file($_FILES['image']['tmp_name'], $targetFile)) {
            return json_encode(array(
                'status' => 'success',
                'path'   => '/sermon_images/' . $userId . '/' . $filename
            ));
        }

        return json_encode(array('status' => 'error', 'message' => 'move_uploaded_file failed'));
    }

    /**
     * ============================================================
     * КОНЕЦ вставки.
     * ============================================================
     */


    /**
     * ============================================================
     * ИНСТРУКЦИЯ: Вставить методы ниже в app/Ajax.php
     * ПЕРЕД методом updateSocket().
     * ============================================================
     */

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

        Info::get('db')->exec("DELETE FROM current WHERE groupId={$userId}");

        if ($text !== '') {
            Info::get('db')->exec(
                "INSERT INTO current (groupId, image, text, song_name)
                 VALUES ({$userId}, '__bible__', '{$text}', '{$song_name}')"
            );
        }

        self::updateSocket();
        return '';
    }

    /**
     * ============================================================
     * КОНЕЦ вставки.
     * ============================================================
     */


    /**
     * ============================================================
     * ИНСТРУКЦИЯ:
     *   Вставить все методы ниже в app/Ajax.php
     *   ПЕРЕД методом updateSocket().
     * ============================================================
     */

    // --------------------------------------------------------
    // Создать новый сборник песен
    // Параметры: name
    // --------------------------------------------------------
    private static function create_song_list()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }

        $dbh = Info::get('dbh');
        $name = mysqli_real_escape_string($dbh, trim(self::$args['name'] ?? ''));

        if ($name === '') {
            return json_encode(['status' => 'error', 'message' => 'Название не может быть пустым']);
        }

        // Получить следующий LIST_ID
        $row = Info::get('db')->get("SELECT MAX(LIST_ID) AS max_id FROM list_names");
        $nextId = ($row && $row['max_id']) ? (int)$row['max_id'] + 1 : 1;

        $userId = (int)$_SESSION['userId'];
        Info::get('db')->exec(
            "INSERT INTO list_names (LIST_ID, LIST_NAME, ADDEDBY) VALUES ({$nextId}, '{$name}', {$userId})"
        );

        return json_encode(['status' => 'success', 'list_id' => $nextId]);
    }

    // --------------------------------------------------------
    // Импорт текстов песен в формате SOG
    // POST-файл: sogfile
    // POST-поля: list_id, lang (ru|lt|en)
    // --------------------------------------------------------
    private static function import_songs_sog()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }

        if (!isset($_FILES['sogfile']) || $_FILES['sogfile']['error'] !== UPLOAD_ERR_OK) {
            $errCode = isset($_FILES['sogfile']) ? $_FILES['sogfile']['error'] : 'no file';
            return json_encode(['status' => 'error', 'message' => 'Файл не загружен (код ' . $errCode . ')']);
        }

        $listId = (int)($_POST['list_id'] ?? 0);
        $lang = trim($_POST['lang'] ?? 'ru');

        if (!in_array($lang, ['ru', 'lt', 'en'])) {
            return json_encode(['status' => 'error', 'message' => 'Неверный язык']);
        }
        if ($listId <= 0) {
            return json_encode(['status' => 'error', 'message' => 'Не указан сборник']);
        }

        $field = $lang === 'ru' ? 'TEXT' : ($lang === 'lt' ? 'TEXT_LT' : 'TEXT_EN');

        // Прочитать файл, снять UTF-8 BOM если есть
        $raw = file_get_contents($_FILES['sogfile']['tmp_name']);
        $raw = ltrim($raw, "\xEF\xBB\xBF"); // UTF-8 BOM
        $raw = str_replace("\r\n", "\n", $raw);
        $raw = str_replace("\r", "\n", $raw);
        $lines = explode("\n", $raw);

        $dbh = Info::get('dbh');
        $db = Info::get('db');
        $log = [];
        $updated = 0;
        $errors = 0;

        $i = 0;
        $total = count($lines);

        while ($i < $total) {
            // Пропустить пустые строки между песнями
            if (trim($lines[$i]) === '') {
                $i++;
                continue;
            }

            // Строка 1: номер песни
            $num = trim($lines[$i]);
            $i++;
            if ($i >= $total) break;

            // Строка 2: название
            $name = trim($lines[$i]);
            $i++;

            // Строки 3+: куплеты до пустой строки
            $verses = [];
            while ($i < $total && trim($lines[$i]) !== '') {
                $verses[] = $lines[$i];
                $i++;
            }
            $text = implode("\r\n", $verses);

            if ($num === '') {
                $log[] = ['type' => 'warn', 'msg' => "Строка ~{$i}: пропущен номер песни"];
                $errors++;
                continue;
            }

            // Найти песню в базе
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
                $log[] = ['type' => 'ok', 'msg' => "Обновлена песня #{$num} «{$name}»"];
            } else {
                // Создать новую запись
                $nameField = $lang === 'ru' ? "NAME='{$nameEsc}', TEXT='{$textEsc}'"
                    : "NAME='{$nameEsc}', {$field}='{$textEsc}'";
                $db->exec(
                    "INSERT INTO song_list (LISTID, NUM, NAME, {$field})
                     VALUES ({$listId}, '{$numEsc}', '{$nameEsc}', '{$textEsc}')"
                );
                $log[] = ['type' => 'ok', 'msg' => "Добавлена песня #{$num} «{$name}»"];
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
    // Импорт картинок сборника из ZIP-архива
    // POST-файл: zipfile
    // POST-поля: list_id
    // --------------------------------------------------------
    private static function import_song_images_zip()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }

        if (!isset($_FILES['zipfile']) || $_FILES['zipfile']['error'] !== UPLOAD_ERR_OK) {
            $errCode = isset($_FILES['zipfile']) ? $_FILES['zipfile']['error'] : 'no file';
            return json_encode(['status' => 'error', 'message' => 'Файл не загружен (код ' . $errCode . ')']);
        }

        $listId = (int)($_POST['list_id'] ?? 0);
        if ($listId <= 0) {
            return json_encode(['status' => 'error', 'message' => 'Не указан сборник']);
        }

        if (!class_exists('ZipArchive')) {
            return json_encode(['status' => 'error', 'message' => 'Расширение ZipArchive не установлено на сервере']);
        }

        $zip = new ZipArchive();
        $res = $zip->open($_FILES['zipfile']['tmp_name']);
        if ($res !== true) {
            return json_encode(['status' => 'error', 'message' => 'Не удалось открыть ZIP (код ' . $res . ')']);
        }

        $targetDir = __DIR__ . '/../public/images/' . $listId . '/';
        if (!file_exists($targetDir)) {
            mkdir($targetDir, 0777, true);
        }

        $allowedExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        $extracted = 0;
        $errors = 0;
        $log = [];

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);

            // Пропустить папки и скрытые файлы
            if (substr($name, -1) === '/' || strpos(basename($name), '.') === 0) continue;

            $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
            if (!in_array($ext, $allowedExt)) {
                $log[] = ['type' => 'warn', 'msg' => "Пропущен файл (не картинка): {$name}"];
                continue;
            }

            // Имя файла без пути (на случай вложенных папок в ZIP)
            $basename = basename($name);
            $targetFile = $targetDir . $basename;

            $content = $zip->getFromIndex($i);
            if ($content === false) {
                $log[] = ['type' => 'error', 'msg' => "Ошибка чтения из ZIP: {$name}"];
                $errors++;
                continue;
            }

            if (file_put_contents($targetFile, $content) === false) {
                $log[] = ['type' => 'error', 'msg' => "Ошибка записи файла: {$basename}"];
                $errors++;
                continue;
            }

            $log[] = ['type' => 'ok', 'msg' => "Сохранён: {$basename}"];
            $extracted++;
        }

        $zip->close();

        return json_encode([
            'status' => 'success',
            'extracted' => $extracted,
            'errors' => $errors,
            'log' => $log,
        ]);
    }

    // --------------------------------------------------------
    // Импорт посланий в формате SOG
    // POST-файл: sogfile
    // POST-поля: lang (ru|lt|en)
    // --------------------------------------------------------
    private static function import_messages_sog()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }

        if (!isset($_FILES['sogfile']) || $_FILES['sogfile']['error'] !== UPLOAD_ERR_OK) {
            $errCode = isset($_FILES['sogfile']) ? $_FILES['sogfile']['error'] : 'no file';
            return json_encode(['status' => 'error', 'message' => 'Файл не загружен (код ' . $errCode . ')']);
        }

        $lang = trim($_POST['lang'] ?? 'ru');
        if (!in_array($lang, ['ru', 'lt', 'en'])) {
            return json_encode(['status' => 'error', 'message' => 'Неверный язык']);
        }

        $textField = $lang === 'ru' ? 'TEXT' : ($lang === 'lt' ? 'TEXT_LT' : 'TEXT_EN');

        // Прочитать файл, снять UTF-8 BOM
        $raw = file_get_contents($_FILES['sogfile']['tmp_name']);
        $raw = ltrim($raw, "\xEF\xBB\xBF"); // UTF-8 BOM

        // Нормализовать окончания строк (CR+LF → LF)
        $raw = str_replace("\r\n", "\n", $raw);
        $raw = str_replace("\r", "\n", $raw);
        $lines = explode("\n", $raw);

        $dbh = Info::get('dbh');
        $db = Info::get('db');
        $userId = (int)$_SESSION['userId'];
        $log = [];
        $inserted = 0;
        $updated = 0;
        $errors = 0;

        $i = 0;
        $total = count($lines);

        while ($i < $total) {
            // ── Шаг 1: первая строка (игнорируется) ──────────
            // Пропустить пустые строки между блоками
            if (trim($lines[$i]) === '') {
                $i++;
                continue;
            }
            $i++; // игнорируем строку-заголовок

            if ($i >= $total) break;

            // ── Шаг 2: строка с кодом, названием и городом ──
            $headerLine = $lines[$i];
            $i++;

            // CODE — от начала до первого пробела
            if (!preg_match('/^(\S+)\s*/', $headerLine, $m)) {
                $log[] = ['type' => 'warn', 'msg' => "Строка {$i}: не удалось разобрать заголовок: {$headerLine}"];
                $errors++;
                // Пропустить до следующей пустой строки
                while ($i < $total && trim($lines[$i]) !== '') $i++;
                continue;
            }
            $code = $m[1];
            $rest = substr($headerLine, strlen($m[0]));

            // Убрать ведущие пробелы и тире
            $rest = ltrim($rest, " \t-–—");

            // TITLE — до символа "("
            $parenPos = strpos($rest, '(');
            if ($parenPos !== false) {
                $title = rtrim(substr($rest, 0, $parenPos), " \t(");
                // CITY — между скобками
                $closePos = strpos($rest, ')', $parenPos);
                $city = $closePos !== false
                    ? trim(substr($rest, $parenPos + 1, $closePos - $parenPos - 1))
                    : '';
            } else {
                $title = trim($rest);
                $city = '';
            }

            if ($code === '') {
                $log[] = ['type' => 'warn', 'msg' => "Строка ~{$i}: пустой код послания, пропускаем"];
                $errors++;
                while ($i < $total && trim($lines[$i]) !== '') $i++;
                continue;
            }

            // ── Шаг 3: абзацы текста до пустой строки ───────
            $paragraphs = [];
            while ($i < $total) {
                $line = $lines[$i];
                // Пустая строка или строка из одних пробелов — конец послания
                if (trim($line) === '') {
                    $i++;
                    break;
                }
                $paragraphs[] = $line;
                $i++;
            }
            $text = implode("\r\n", $paragraphs);

            // Сохранить в базу данных
            $codeEsc = mysqli_real_escape_string($dbh, $code);
            $titleEsc = mysqli_real_escape_string($dbh, $title);
            $cityEsc = mysqli_real_escape_string($dbh, $city);
            $textEsc = mysqli_real_escape_string($dbh, $text);

            $existing = $db->get(
                "SELECT ID FROM messages WHERE CODE='{$codeEsc}' LIMIT 1"
            );

            if ($existing) {
                // Обновить текст на нужном языке (и при ru — также TITLE/CITY если пусты)
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
                $log[] = ['type' => 'ok', 'msg' => "Обновлено: [{$code}] {$title}"];
                $updated++;
            } else {
                // Новая запись
                $textRu = $lang === 'ru' ? "'{$textEsc}'" : "''";
                $textLt = $lang === 'lt' ? "'{$textEsc}'" : "''";
                $textEn = $lang === 'en' ? "'{$textEsc}'" : "''";

                $db->exec(
                    "INSERT INTO messages (USER_ID, CODE, TITLE, CITY, TEXT, TEXT_LT, TEXT_EN)
                     VALUES ({$userId}, '{$codeEsc}', '{$titleEsc}', '{$cityEsc}', {$textRu}, {$textLt}, {$textEn})"
                );
                $log[] = ['type' => 'ok', 'msg' => "Добавлено: [{$code}] {$title} ({$city})"];
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
    // КОНЕЦ - Импорт посланий в формате SOG
    // --------------------------------------------------------

// --------------------------------------------------------
    // Импорт послания (ввод текстом вручную)
    // POST-поля: lang, code, title, city, para_sep, body
    // --------------------------------------------------------
    private static function import_messages_text()
    {
        if (!Security::isAdmin()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }

        $lang    = trim(self::$args['lang']     ?? 'ru');
        $code    = trim(self::$args['code']     ?? '');
        $title   = trim(self::$args['title']    ?? '');
        $city    = trim(self::$args['city']     ?? '');
        $paraSep = trim(self::$args['para_sep'] ?? 'emptyline');
        $body    = self::$args['body']          ?? '';

        if (!in_array($lang, ['ru', 'lt', 'en'])) {
            return json_encode(['status' => 'error', 'message' => 'Неверный язык']);
        }

        $mode    = trim(self::$args['mode'] ?? 'new');

        if ($code === '') {
            return json_encode(['status' => 'error', 'message' => 'Код послания не может быть пустым']);
        }
        if ($mode === 'new' && $title === '') {
            return json_encode(['status' => 'error', 'message' => 'Название не может быть пустым']);
        }
        if (trim($body) === '') {
            return json_encode(['status' => 'error', 'message' => 'Текст послания пустой']);
        }

        // Валидация формата кода: YY-MMDD[x][x]
        if (!preg_match('/^\d{2}-\d{4}[A-Za-z]{0,2}$/', $code)) {
            return json_encode(['status' => 'error', 'message' => 'Неверный формат кода: ожидается YY-MMDD или YY-MMDDx']);
        }

        // Нормализовать окончания строк
        $body = str_replace("\r\n", "\n", $body);
        $body = str_replace("\r", "\n", $body);

        // Разбить на абзацы
        if ($paraSep === 'emptyline') {
            // Разделитель — пустая строка; несколько пустых строк подряд = один разделитель
            $blocks = preg_split('/\n{2,}/', trim($body));
        } else {
            // Каждая непустая строка — отдельный абзац
            $blocks = explode("\n", $body);
        }

        // Убрать пустые блоки и лишние пробелы
        $paragraphs = array_filter(array_map('trim', $blocks), function ($b) { return $b !== ''; });
        $text = implode("\r\n", $paragraphs);

        $dbh  = Info::get('dbh');
        $db   = Info::get('db');
        $userId = (int)$_SESSION['userId'];

        $textField = $lang === 'ru' ? 'TEXT' : ($lang === 'lt' ? 'TEXT_LT' : 'TEXT_EN');

        $codeEsc  = mysqli_real_escape_string($dbh, $code);
        $titleEsc = mysqli_real_escape_string($dbh, $title);
        $cityEsc  = mysqli_real_escape_string($dbh, $city);
        $textEsc  = mysqli_real_escape_string($dbh, $text);

        $existing = $db->get("SELECT ID FROM messages WHERE CODE='{$codeEsc}' LIMIT 1");

        if ($mode === 'translate' && !$existing) {
            return json_encode(['status' => 'error', 'message' => "Послание [{$codeEsc}] не найдено. Сначала создайте его (режим «Новое послание»)"]);
        }

        if ($existing) {
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
            return json_encode([
                'status'  => 'success',
                'action'  => 'updated',
                'message' => "Обновлено: [{$code}] {$title}" . ($city ? " ({$city})" : ''),
            ]);
        }

        // Новая запись
        $textRu = $lang === 'ru' ? "'{$textEsc}'" : "''";
        $textLt = $lang === 'lt' ? "'{$textEsc}'" : "''";
        $textEn = $lang === 'en' ? "'{$textEsc}'" : "''";

        $db->exec(
            "INSERT INTO messages (USER_ID, CODE, TITLE, CITY, TEXT, TEXT_LT, TEXT_EN)
             VALUES ({$userId}, '{$codeEsc}', '{$titleEsc}', '{$cityEsc}', {$textRu}, {$textLt}, {$textEn})"
        );

        return json_encode([
            'status'  => 'success',
            'action'  => 'inserted',
            'message' => "Добавлено: [{$code}] {$title}" . ($city ? " ({$city})" : ''),
        ]);
    }
    // КОНЕЦ - Импорт послания (ввод текстом)
    // --------------------------------------------------------

    // --------------------------------------------------------
    // Поиск посланий по коду (для автодополнения)
    // Параметры: query
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


    private static function updateSocket()
    {
        $err1 = '';
        $err2 = '';
        $instance = stream_socket_client("tcp://127.0.0.1:2346", $err1, $err2);
        if ($instance) {
            fwrite($instance, json_encode(['type' => 'update_needed']) . "\n");
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
        $settings = Info::get('db')->get("SELECT * FROM user_settings WHERE user_id = {$userId}");

        if (!$settings) {
            $settings = [
                'user_id' => $userId,
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

    private static function save_user_settings()
    {
        $userId = $_SESSION['userId'];
        $settings = self::$args['settings'];

        $displayName             = mysqli_escape_string(Info::get('dbh'), $settings['display_name']);
        $favoritesOrder          = mysqli_escape_string(Info::get('dbh'), $settings['favorites_order']);
        $availableLists          = mysqli_escape_string(Info::get('dbh'), $settings['available_lists']);
        $placeholderImage        = mysqli_escape_string(Info::get('dbh'), $settings['placeholder_image']);
        $mainBgColor             = mysqli_escape_string(Info::get('dbh'), $settings['main_bg_color']);
        $mainFont                = mysqli_escape_string(Info::get('dbh'), $settings['main_font']);
        $mainFontColor           = mysqli_escape_string(Info::get('dbh'), $settings['main_font_color']);
        $streamingBgColor        = mysqli_escape_string(Info::get('dbh'), $settings['streaming_bg_color']);
        $streamingFont           = mysqli_escape_string(Info::get('dbh'), $settings['streaming_font']);
        $streamingFontColor      = mysqli_escape_string(Info::get('dbh'), $settings['streaming_font_color']);
        $streamingHeightPercent  = intval($settings['streaming_height_percent']);
        $sermonNotesBgColor      = mysqli_escape_string(Info::get('dbh'), isset($settings['sermon_notes_bg_color'])   ? $settings['sermon_notes_bg_color']   : '#2b2b2b');
        $sermonBibleBaseColor    = mysqli_escape_string(Info::get('dbh'), isset($settings['sermon_bible_base_color']) ? $settings['sermon_bible_base_color'] : '#1565c0');
        $sermonMsgBaseColor      = mysqli_escape_string(Info::get('dbh'), isset($settings['sermon_msg_base_color'])   ? $settings['sermon_msg_base_color']   : '#6a1b9a');
        $sermonNotesFontSize     = isset($settings['sermon_notes_font_size']) ? intval($settings['sermon_notes_font_size']) : 13;
        $sermonScaleChips        = isset($settings['sermon_scale_chips'])     ? intval($settings['sermon_scale_chips'])     : 0;

        $existing = Info::get('db')->get("SELECT user_id FROM user_settings WHERE user_id = {$userId}");

        if ($existing) {
            Info::get('db')->exec("
                UPDATE user_settings SET
                    display_name             = '{$displayName}',
                    favorites_order          = '{$favoritesOrder}',
                    available_lists          = '{$availableLists}',
                    placeholder_image        = '{$placeholderImage}',
                    main_bg_color            = '{$mainBgColor}',
                    main_font                = '{$mainFont}',
                    main_font_color          = '{$mainFontColor}',
                    streaming_bg_color       = '{$streamingBgColor}',
                    streaming_font           = '{$streamingFont}',
                    streaming_font_color     = '{$streamingFontColor}',
                    streaming_height_percent = {$streamingHeightPercent},
                    sermon_notes_bg_color    = '{$sermonNotesBgColor}',
                    sermon_bible_base_color  = '{$sermonBibleBaseColor}',
                    sermon_msg_base_color    = '{$sermonMsgBaseColor}',
                    sermon_notes_font_size   = '{$sermonNotesFontSize}',
                    sermon_scale_chips       = '{$sermonScaleChips}'
                WHERE user_id = {$userId}
            ");
        } else {
            Info::get('db')->exec("
                INSERT INTO user_settings (
                    user_id, display_name, favorites_order, available_lists, placeholder_image,
                    main_bg_color, main_font, main_font_color,
                    streaming_bg_color, streaming_font, streaming_font_color, streaming_height_percent,
                    sermon_notes_bg_color, sermon_bible_base_color, sermon_msg_base_color, sermon_notes_font_size, sermon_scale_chips
                ) VALUES (
                    {$userId}, '{$displayName}', '{$favoritesOrder}', '{$availableLists}', '{$placeholderImage}',
                    '{$mainBgColor}', '{$mainFont}', '{$mainFontColor}',
                    '{$streamingBgColor}', '{$streamingFont}', '{$streamingFontColor}', {$streamingHeightPercent},
                    '{$sermonNotesBgColor}', '{$sermonBibleBaseColor}', '{$sermonMsgBaseColor}',
                    '{$sermonNotesFontSize}', '{$sermonScaleChips}'
                )
            ");
        }

        return json_encode(['status' => 'success']);
    }


    private static function save_sermon_notes_settings()
    {
        $userId   = (int)$_SESSION['userId'];
        $fontSize = isset(self::$args['sermon_notes_font_size']) ? intval(self::$args['sermon_notes_font_size']) : 13;
        $scale    = isset(self::$args['sermon_scale_chips'])     ? intval(self::$args['sermon_scale_chips'])     : 0;

        $existing = Info::get('db')->get("SELECT user_id FROM user_settings WHERE user_id = {$userId}");
        if ($existing) {
            Info::get('db')->exec("
            UPDATE user_settings
            SET sermon_notes_font_size = {$fontSize},
                sermon_scale_chips     = {$scale}
            WHERE user_id = {$userId}
        ");
        }
        return json_encode(['status' => 'success']);
    }

// ============================================================
    // ПОЛЬЗОВАТЕЛИ ГРУППЫ
    // ============================================================

    private static function get_group_users()
    {
        $userId = (int)$_SESSION['userId'];
        // Все пользователи группы: сам admin (ID=$userId) + остальные (GROUP_ID=$userId)
        $users = Info::get('db')->select(
            "SELECT ID, NAME, LOGIN, PASS, ROLE
             FROM users
             WHERE ID = {$userId} OR GROUP_ID = {$userId}
             ORDER BY FIELD(ROLE, 'admin', 'leader', 'musician', 'preacher')"
        );
        return json_encode($users);
    }

    private static function update_group_user()
    {
        $userId  = (int)$_SESSION['userId'];
        $dbh     = Info::get('dbh');
        $id      = (int)self::$args['id'];
        $name    = mysqli_real_escape_string($dbh, self::$args['name']);
        $login   = mysqli_real_escape_string($dbh, self::$args['login']);
        $pass    = mysqli_real_escape_string($dbh, self::$args['pass']);

        // Убедимся, что редактируем только своего пользователя
        $check = Info::get('db')->get(
            "SELECT ID FROM users WHERE ID = {$id} AND (ID = {$userId} OR GROUP_ID = {$userId})"
        );
        if (!$check) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }

        Info::get('db')->exec(
            "UPDATE users SET NAME = '{$name}', LOGIN = '{$login}', PASS = '{$pass}'
             WHERE ID = {$id}"
        );
        return json_encode(['status' => 'success']);
    }

    private static function create_group_user()
    {
        $userId  = (int)$_SESSION['userId'];
        $dbh     = Info::get('dbh');
        $role    = mysqli_real_escape_string($dbh, self::$args['role']);

        $allowed = ['admin', 'leader', 'musician', 'preacher'];
        if (!in_array($role, $allowed)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid role']);
        }

        // Проверить, не существует ли уже такой пользователь
        $existing = Info::get('db')->get(
            "SELECT ID FROM users
             WHERE ROLE = '{$role}' AND (ID = {$userId} OR GROUP_ID = {$userId})"
        );
        if ($existing) {
            return json_encode(['status' => 'error', 'message' => 'User already exists']);
        }

        // Получить имя группы (из admin-пользователя)
        $adminUser = Info::get('db')->get("SELECT NAME FROM users WHERE ID = {$userId}");
        $groupName = $adminUser ? $adminUser['NAME'] : 'Group';

        $roleLabels = [
            'admin'    => 'Администратор',
            'leader'   => 'Ведущий',
            'musician' => 'Музыкант',
            'preacher' => 'Проповедник'
        ];
        $defaultName  = $groupName . ' - ' . $roleLabels[$role];
        $defaultLogin = strtolower(preg_replace('/\s+/', '_', $groupName)) . '_' . $role;

        // Генерация пароля: 8 символов
        $chars    = 'abcdefghjkmnpqrstuvwxyz23456789';
        $password = '';
        for ($i = 0; $i < 8; $i++) {
            $password .= $chars[random_int(0, strlen($chars) - 1)];
        }

        $escapedName  = mysqli_real_escape_string($dbh, $defaultName);
        $escapedLogin = mysqli_real_escape_string($dbh, $defaultLogin);
        $escapedPass  = mysqli_real_escape_string($dbh, $password);

        Info::get('db')->exec(
            "INSERT INTO users (NAME, LOGIN, PASS, ROLE, GROUP_ID)
             VALUES ('{$escapedName}', '{$escapedLogin}', '{$escapedPass}', '{$role}', {$userId})"
        );

        $newId = Info::get('dbh')->insert_id;
        return json_encode([
            'status' => 'success',
            'user'   => [
                'ID'    => $newId,
                'NAME'  => $defaultName,
                'LOGIN' => $defaultLogin,
                'PASS'  => $password,
                'ROLE'  => $role
            ]
        ]);
    }

    private static function upload_placeholder_image()
    {
        if (isset($_FILES['image']) && $_FILES['image']['error'] == 0) {
            $uploadDir = __DIR__ . '/../public/images/placeholders/';

            if (!file_exists($uploadDir)) {
                mkdir($uploadDir, 0777, true);
            }

            $userId = $_SESSION['userId'];
            $extension = pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION);
            $filename = 'placeholder_' . $userId . '.' . $extension;
            $targetFile = $uploadDir . $filename;

            if (move_uploaded_file($_FILES['image']['tmp_name'], $targetFile)) {
                return json_encode([
                    'status' => 'success',
                    'path' => '/images/placeholders/' . $filename
                ]);
            } else {
                return json_encode(['status' => 'error', 'message' => 'Failed to move uploaded file']);
            }
        }

        return json_encode(['status' => 'error', 'message' => 'No file uploaded']);
    }
}