<?php

/**
 * Settings page Ajax methods
 * Handles user settings, group management, placeholder uploads
 */
trait Ajax_Settings
{
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

    // ============================================================
    // ПОЛЬЗОВАТЕЛИ ГРУППЫ
    // ============================================================

    private static function get_group_users()
    {
        $userId = (int)$_SESSION['userId'];
        $users  = Info::get('db')->select(
            "SELECT ID, NAME, LOGIN, PASS, ROLE
             FROM users
             WHERE GROUP_ID = {$userId}
                OR (ID = {$userId} AND (GROUP_ID = 0 OR GROUP_ID IS NULL))
             ORDER BY FIELD(ROLE, 'admin', 'leader', 'musician', 'preacher')"
        );

        foreach ($users as &$u) {
            $u['PASS'] = Security::decryptPassword($u['PASS']);
        }
        unset($u);

        return json_encode($users);
    }

    private static function update_group_user()
    {
        $userId = (int)$_SESSION['userId'];
        $dbh    = Info::get('dbh');
        $id     = (int)self::$args['id'];
        $name   = mysqli_real_escape_string($dbh, self::$args['name']  ?? '');
        $login  = mysqli_real_escape_string($dbh, self::$args['login'] ?? '');
        $pass   = self::$args['pass'] ?? '';

        // Убедимся, что редактируем только своего пользователя
        $check = Info::get('db')->get(
            "SELECT ID FROM users WHERE ID = {$id} AND (ID = {$userId} OR GROUP_ID = {$userId})"
        );
        if (!$check) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }

        // [SECURITY #1] Шифруем пароль перед сохранением
        $encryptedPass = Security::encryptPassword($pass);
        $escapedPass   = mysqli_real_escape_string($dbh, $encryptedPass);

        Info::get('db')->exec(
            "UPDATE users SET NAME='{$name}', LOGIN='{$login}', PASS='{$escapedPass}'
             WHERE ID={$id}"
        );

        // [SECURITY #4] Regenerate session ID after password change for current user
        if ($id === $userId) {
            session_regenerate_id(true);
        }

        return json_encode(['status' => 'success']);
    }

    private static function create_group_user()
    {
        $userId = (int)$_SESSION['userId'];
        $dbh    = Info::get('dbh');
        $role   = mysqli_real_escape_string($dbh, self::$args['role'] ?? '');

        $allowed = ['admin', 'leader', 'musician', 'preacher'];
        if (!in_array($role, $allowed)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid role']);
        }

        $existing = Info::get('db')->get(
            "SELECT ID FROM users
             WHERE ROLE = '{$role}' AND (ID = {$userId} OR GROUP_ID = {$userId})"
        );
        if ($existing) {
            return json_encode(['status' => 'error', 'message' => 'User already exists']);
        }

        $adminUser = Info::get('db')->get("SELECT NAME FROM users WHERE ID = {$userId}");
        $groupName = $adminUser ? $adminUser['NAME'] : 'Group';

        $roleLabels = [
            'admin'    => 'Администратор',
            'leader'   => 'Ведущий',
            'musician' => 'Музыкант',
            'preacher' => 'Проповедник',
        ];
        $defaultName  = $groupName . ' - ' . $roleLabels[$role];
        $defaultLogin = strtolower(preg_replace('/\s+/', '_', $groupName)) . '_' . $role;

        // Генерация пароля: 8 символов
        $chars    = 'abcdefghjkmnpqrstuvwxyz23456789';
        $password = '';
        for ($i = 0; $i < 8; $i++) {
            $password .= $chars[random_int(0, strlen($chars) - 1)];
        }

        // [SECURITY #1] Шифруем пароль перед сохранением
        $encryptedPass = Security::encryptPassword($password);

        $escapedName  = mysqli_real_escape_string($dbh, $defaultName);
        $escapedLogin = mysqli_real_escape_string($dbh, $defaultLogin);
        $escapedPass  = mysqli_real_escape_string($dbh, $encryptedPass);

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
                'PASS'  => $password,   // plaintext возвращается только один раз при создании
                'ROLE'  => $role,
            ],
        ]);
    }

    private static function upload_placeholder_image()
    {
        if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
            return json_encode(['status' => 'error', 'message' => 'No file uploaded']);
        }

        // [SECURITY #5] Проверка расширения
        $ext     = strtolower(pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION));
        $allowedExt  = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        if (!in_array($ext, $allowedExt, true)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid file extension: ' . $ext]);
        }

        // [SECURITY #5] Проверка реального MIME-типа файла
        $allowedMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!self::checkMime($_FILES['image']['tmp_name'], $allowedMime)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid file type (MIME mismatch)']);
        }

        $uploadDir = __DIR__ . '/../public/images/placeholders/';
        if (!file_exists($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        $userId   = (int)$_SESSION['userId'];
        $filename = 'placeholder_' . $userId . '.' . $ext;
        $target   = $uploadDir . $filename;

        if (move_uploaded_file($_FILES['image']['tmp_name'], $target)) {
            return json_encode(['status' => 'success', 'path' => '/images/placeholders/' . $filename]);
        }
        return json_encode(['status' => 'error', 'message' => 'Failed to move uploaded file']);
    }
}
