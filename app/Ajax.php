<?php

class Ajax
{
    private static $args;

    private static function get_song_list()
    {
        $list = Info::get('db')->select("select *, concat(NUM, '   ',NAME) as dispName, TEXT from song_list where LISTID = ".self::$args['list_id']." order by NUM");
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
        $sql = "SELECT f.ID as FID, l.*, concat(l.num, ' - ',l.name) as dispName, 
                        concat('/images/',l.LISTID,'/',l.num,'.jpg') as imageName, f.SONGID FROM favorites f 
                left join song_list l ON l.ID=f.SONGID
                where f.groupId={$_SESSION['userId']}
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
            // Return defaults if no settings exist
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
                'streaming_height_percent' => 100
            ];
        }

        return json_encode($settings);
    }

    private static function save_user_settings()
    {
        $userId = $_SESSION['userId'];
        $settings = self::$args['settings'];

        // Escape values
        $displayName = mysqli_escape_string(Info::get('dbh'), $settings['display_name']);
        $favoritesOrder = mysqli_escape_string(Info::get('dbh'), $settings['favorites_order']);
        $availableLists = mysqli_escape_string(Info::get('dbh'), $settings['available_lists']);
        $placeholderImage = mysqli_escape_string(Info::get('dbh'), $settings['placeholder_image']);
        $mainBgColor = mysqli_escape_string(Info::get('dbh'), $settings['main_bg_color']);
        $mainFont = mysqli_escape_string(Info::get('dbh'), $settings['main_font']);
        $mainFontColor = mysqli_escape_string(Info::get('dbh'), $settings['main_font_color']);
        $streamingBgColor = mysqli_escape_string(Info::get('dbh'), $settings['streaming_bg_color']);
        $streamingFont = mysqli_escape_string(Info::get('dbh'), $settings['streaming_font']);
        $streamingFontColor = mysqli_escape_string(Info::get('dbh'), $settings['streaming_font_color']);
        $streamingHeightPercent = intval($settings['streaming_height_percent']);

        // Check if settings exist
        $existing = Info::get('db')->get("SELECT user_id FROM user_settings WHERE user_id = {$userId}");

        if ($existing) {
            // Update existing settings
            Info::get('db')->exec("
                UPDATE user_settings SET
                    display_name = '{$displayName}',
                    favorites_order = '{$favoritesOrder}',
                    available_lists = '{$availableLists}',
                    placeholder_image = '{$placeholderImage}',
                    main_bg_color = '{$mainBgColor}',
                    main_font = '{$mainFont}',
                    main_font_color = '{$mainFontColor}',
                    streaming_bg_color = '{$streamingBgColor}',
                    streaming_font = '{$streamingFont}',
                    streaming_font_color = '{$streamingFontColor}',
                    streaming_height_percent = {$streamingHeightPercent}
                WHERE user_id = {$userId}
            ");
        } else {
            // Insert new settings
            Info::get('db')->exec("
                INSERT INTO user_settings (
                    user_id, display_name, favorites_order, available_lists, placeholder_image,
                    main_bg_color, main_font, main_font_color,
                    streaming_bg_color, streaming_font, streaming_font_color, streaming_height_percent
                ) VALUES (
                    {$userId}, '{$displayName}', '{$favoritesOrder}', '{$availableLists}', '{$placeholderImage}',
                    '{$mainBgColor}', '{$mainFont}', '{$mainFontColor}',
                    '{$streamingBgColor}', '{$streamingFont}', '{$streamingFontColor}', {$streamingHeightPercent}
                )
            ");
        }

        return json_encode(['status' => 'success']);
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