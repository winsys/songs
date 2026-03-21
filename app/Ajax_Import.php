<?php

/**
 * Import page Ajax methods
 * Handles song list creation, SOG imports, language management
 */
trait Ajax_Import
{
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

        $userId = (int)$_SESSION['curGroupId'];
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
        $userId = (int)$_SESSION['curGroupId'];
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

    // --------------------------------------------------------
    // Импорт послания (ввод текстом вручную)
    // POST-поля: lang, code, title, city, para_sep, body
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
        // Нормализовать таймкоды: привести к \r\n, убрать пустые строки
        $timecodesRaw = self::$args['timecodes'] ?? '';
        $timecodesRaw = str_replace("\r\n", "\n", $timecodesRaw);
        $timecodesRaw = str_replace("\r", "\n",   $timecodesRaw);
        $tcLines = array_filter(array_map('trim', explode("\n", $timecodesRaw)), function($l) { return $l !== ''; });
        $timecodes = implode("\r\n", $tcLines);

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

        // Внутри каждого абзаца убрать все оставшиеся переносы строк
        $blocks = array_map(function ($b) {
            return trim(preg_replace('/[\r\n]+/', ' ', $b));
        }, $blocks);

        // Убрать пустые блоки и лишние пробелы
        $paragraphs = array_filter(array_map('trim', $blocks), function ($b) { return $b !== ''; });
        $text = implode("\r\n", $paragraphs);

        // Проверить совпадение числа абзацев и таймкодов
        $tcCount   = count($tcLines);
        $paraCount = count($paragraphs);
        $tcWarning = '';
        if ($tcCount > 0 && $tcCount !== $paraCount) {
            $tcWarning = "⚠ Несовпадение: таймкодов {$tcCount}, абзацев {$paraCount}. Таймкоды сохранены как есть.";
        }

        $dbh  = Info::get('dbh');
        $db   = Info::get('db');
        $userId = (int)$_SESSION['curGroupId'];

        $textField = $lang === 'ru' ? 'TEXT' : ($lang === 'lt' ? 'TEXT_LT' : 'TEXT_EN');

        $codeEsc       = mysqli_real_escape_string($dbh, $code);
        $titleEsc      = mysqli_real_escape_string($dbh, $title);
        $cityEsc       = mysqli_real_escape_string($dbh, $city);
        $textEsc       = mysqli_real_escape_string($dbh, $text);
        $audioSrcEsc   = mysqli_real_escape_string($dbh, $audioSrc);
        $timecodesEsc  = mysqli_real_escape_string($dbh, $timecodes);

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

        // Новая запись
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

    // ============================================================
    // ЯЗЫКИ
    // ============================================================

    // --------------------------------------------------------
    // Добавить новый язык
    // Только admin.
    // Параметры: code (напр. "de"), label (напр. "DE")
    //
    // Автоматически:
    //   1. Проверяет корректность кода (только a-z, 2-5 символов)
    //   2. Вычисляет col_suffix = '_' + strtoupper(code)
    //   3. Добавляет запись в таблицу languages
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

        // --- Валидация кода ---
        if (!preg_match('/^[a-z]{2,5}$/', $code)) {
            return json_encode([
                'status' => 'error',
                'message' => 'Код языка должен содержать 2–5 латинских букв (напр. "de", "pl")'
            ]);
        }
        if (empty($label)) {
            return json_encode(['status' => 'error', 'message' => 'Метка языка не может быть пустой']);
        }

        // --- Проверка на дубликат ---
        $existing = $db->get(
            "SELECT code FROM languages WHERE code = '" . mysqli_real_escape_string($dbh, $code) . "'"
        );
        if ($existing) {
            return json_encode(['status' => 'error', 'message' => "Язык «{$code}» уже существует"]);
        }

        // --- Вычислить суффикс и имя колонки ---
        $colSuffix = '_' . strtoupper($code);          // напр. _DE
        $colName = 'TEXT' . $colSuffix;               // напр. TEXT_DE
        $labelEsc = mysqli_real_escape_string($dbh, $label);
        $codeEsc = mysqli_real_escape_string($dbh, $code);
        $colNameEsc = mysqli_real_escape_string($dbh, $colName);

        // --- Определить следующий sort_order ---
        $maxOrder = $db->get("SELECT MAX(sort_order) AS m FROM languages");
        $sortOrder = ($maxOrder && $maxOrder['m'] !== null) ? (int)$maxOrder['m'] + 1 : 1;

        // --- ALTER TABLE: добавить колонку в song_list ---
        $tables = ['song_list', 'messages'];
        foreach ($tables as $table) {
            // Проверить, нет ли уже такой колонки (защита от повторного запуска)
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

        // --- Вставить запись в languages ---
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
    // Удалить язык
    // Только admin + требует спецпароль из config_example.php.
    //
    // Параметры: code, delete_password
    //
    // Защиты:
    //   - нельзя удалить язык с is_default = 1 (русский)
    //   - проверяется спецпароль из config['lang_delete_password']
    //   - DROP COLUMN из song_list и messages
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

        // --- Проверить спецпароль ---
        $correctPassword = $config['lang_delete_password'] ?? '';
        if ($correctPassword === '' || $givenPassword !== $correctPassword) {
            return json_encode(['status' => 'error', 'message' => 'Неверный пароль удаления']);
        }

        // --- Найти язык ---
        $codeEsc = mysqli_real_escape_string($dbh, $code);
        $lang = $db->get("SELECT * FROM languages WHERE code = '{$codeEsc}'");
        if (!$lang) {
            return json_encode(['status' => 'error', 'message' => "Язык «{$code}» не найден"]);
        }

        // --- Запретить удаление языка по умолчанию ---
        if ((int)$lang['is_default'] === 1) {
            return json_encode([
                'status' => 'error',
                'message' => "Нельзя удалить язык по умолчанию («{$code}»). Сначала смените флаг is_default."
            ]);
        }

        // --- Вычислить имя колонки ---
        $colSuffix = $lang['col_suffix'];              // напр. _DE
        $colName = 'TEXT' . $colSuffix;              // напр. TEXT_DE

        // --- DROP COLUMN из song_list и messages ---
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

        // --- Удалить запись из languages ---
        $db->exec("DELETE FROM languages WHERE code = '{$codeEsc}'");

        return json_encode([
            'status' => 'success',
            'message' => "Язык «{$lang['label']}» удалён. Колонка {$colName} удалена из song_list и messages."
        ]);
    }
}
