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
            return json_encode(['status' => 'error', 'message' => 'Название не может быть пустым']);
        }

        // Get the next LIST_ID
        $row = Info::get('db')->get("SELECT MAX(LIST_ID) AS max_id FROM list_names");
        $nextId = ($row && $row['max_id']) ? (int)$row['max_id'] + 1 : 1;

        $userId = (int)$_SESSION['curGroupId'];
        Info::get('db')->exec(
            "INSERT INTO list_names (LIST_ID, LIST_NAME, ADDEDBY) VALUES ({$nextId}, '{$name}', {$userId})"
        );

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
            return json_encode(['status' => 'error', 'message' => 'Файл не загружен (код ' . $errCode . ')']);
        }

        $listId = (int)($_POST['list_id'] ?? 0);
        $lang = trim($_POST['lang'] ?? 'ru');

        $db = Info::get('db');
        $dbh = Info::get('dbh');
        $langRow = $db->get("SELECT col_suffix FROM languages WHERE code = '" . mysqli_real_escape_string($dbh, $lang) . "'");
        if (!$langRow) {
            return json_encode(['status' => 'error', 'message' => 'Неверный язык']);
        }
        if ($listId <= 0) {
            return json_encode(['status' => 'error', 'message' => 'Не указан сборник']);
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
                $log[] = ['type' => 'warn', 'msg' => "Строка ~{$i}: пропущен номер песни"];
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
                $log[] = ['type' => 'ok', 'msg' => "Обновлена песня #{$num} «{$name}»"];
            } else {
                // Create a new record
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
    // Import song book images from a ZIP archive
    // POST file: zipfile
    // POST fields: list_id
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

            // Skip directories and hidden files
            if (substr($name, -1) === '/' || strpos(basename($name), '.') === 0) continue;

            $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
            if (!in_array($ext, $allowedExt)) {
                $log[] = ['type' => 'warn', 'msg' => "Пропущен файл (не картинка): {$name}"];
                continue;
            }

            // Filename without path (handles nested directories inside the ZIP)
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
            return json_encode(['status' => 'error', 'message' => 'Файл не загружен (код ' . $errCode . ')']);
        }

        $lang = trim($_POST['lang'] ?? 'ru');
        $dbh = Info::get('dbh');
        $db = Info::get('db');
        $langRow = $db->get("SELECT col_suffix FROM languages WHERE code = '" . mysqli_real_escape_string($dbh, $lang) . "'");
        if (!$langRow) {
            return json_encode(['status' => 'error', 'message' => 'Неверный язык']);
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
                $log[] = ['type' => 'warn', 'msg' => "Строка {$i}: не удалось разобрать заголовок: {$headerLine}"];
                $errors++;
                // Пропустить до следующей пустой строки
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
                $log[] = ['type' => 'warn', 'msg' => "Строка ~{$i}: пустой код послания, пропускаем"];
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
                $log[] = ['type' => 'ok', 'msg' => "Обновлено: [{$code}] {$title}"];
                $updated++;
            } else {
                // New record
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

        // Validate code format: YY-MMDD[x][x]
        if (!preg_match('/^\d{2}-\d{4}[A-Za-z]{0,2}$/', $code)) {
            return json_encode(['status' => 'error', 'message' => 'Неверный формат кода: ожидается YY-MMDD или YY-MMDDx']);
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
            $tcWarning = "⚠ Несовпадение: таймкодов {$tcCount}, абзацев {$paraCount}. Таймкоды сохранены как есть.";
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
            return json_encode(['status' => 'error', 'message' => "Послание [{$codeEsc}] не найдено. Сначала создайте его (режим «Новое послание»)"]);
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
                'message'  => "Обновлено: [{$code}] {$title}" . ($city ? " ({$city})" : ''),
                'warning'  => $tcWarning,
            ]);
        }

        // New record
        $textRu = $lang === 'ru' ? "'{$textEsc}'" : "''";
        $textLt = $lang === 'lt' ? "'{$textEsc}'" : "''";
        $textEn = $lang === 'en' ? "'{$textEsc}'" : "''";

        $db->exec(
            "INSERT INTO messages (USER_ID, CODE, TITLE, CITY, TEXT, TEXT_LT, TEXT_EN, AUDIO_SRC, TIMECODES)
             VALUES ({$userId}, '{$codeEsc}', '{$titleEsc}', '{$cityEsc}', {$textRu}, {$textLt}, {$textEn},
                     '{$audioSrcEsc}', " . ($timecodesEsc !== '' ? "'{$timecodesEsc}'" : "NULL") . ")"
        );

        return json_encode([
            'status'  => 'success',
            'action'  => 'inserted',
            'message' => "Добавлено: [{$code}] {$title}" . ($city ? " ({$city})" : ''),
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
            "SELECT ID, CODE, TITLE, CITY, TEXT, TEXT_LT, TEXT_EN, TEXT_DE, AUDIO_SRC, TIMECODES
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
                'message' => 'Код языка должен содержать 2–5 латинских букв (напр. "de", "pl")'
            ]);
        }
        if (empty($label)) {
            return json_encode(['status' => 'error', 'message' => 'Метка языка не может быть пустой']);
        }

        // --- Check for duplicate ---
        $existing = $db->get(
            "SELECT code FROM languages WHERE code = '" . mysqli_real_escape_string($dbh, $code) . "'"
        );
        if ($existing) {
            return json_encode(['status' => 'error', 'message' => "Язык «{$code}» уже существует"]);
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
            'message' => "Язык «{$label}» добавлен. Колонка {$colName} создана в song_list и messages."
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
            return json_encode(['status' => 'error', 'message' => 'Неверный пароль удаления']);
        }

        // --- Look up language ---
        $codeEsc = mysqli_real_escape_string($dbh, $code);
        $lang = $db->get("SELECT * FROM languages WHERE code = '{$codeEsc}'");
        if (!$lang) {
            return json_encode(['status' => 'error', 'message' => "Язык «{$code}» не найден"]);
        }

        // --- Forbid deletion of the default language ---
        if ((int)$lang['is_default'] === 1) {
            return json_encode([
                'status' => 'error',
                'message' => "Нельзя удалить язык по умолчанию («{$code}»). Сначала смените флаг is_default."
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
            'message' => "Язык «{$lang['label']}» удалён. Колонка {$colName} удалена из song_list и messages."
        ]);
    }
}
