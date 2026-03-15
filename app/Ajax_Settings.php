<?php

/**
 * Settings page Ajax methods
 * Handles user settings, group management, placeholder uploads
 */
trait Ajax_Settings
{
    private static function get_settings_permissions()
    {
        return json_encode(Security::getSettingsPermissions());
    }

    private static function save_user_settings()
    {
        $userId = $_SESSION['curGroupId'];
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

        $existing = Info::get('db')->get("SELECT group_id FROM user_settings WHERE group_id = {$userId}");

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
                WHERE group_id = {$userId}
            ");
        } else {
            Info::get('db')->exec("
                INSERT INTO user_settings (
                    group_id, display_name, favorites_order, available_lists, placeholder_image,
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
        $userId = (int)$_SESSION['curGroupId'];
        $users  = Info::get('db')->select(
            "SELECT ID, NAME, LOGIN, PASS, ROLE, GOOGLE_ID
             FROM users
             WHERE GROUP_ID = {$userId}
                OR ID = {$userId}
             ORDER BY FIELD(ROLE, 'admin', 'leader', 'musician', 'preacher', 'tech')"
        );

        foreach ($users as &$u) {
            $u['PASS'] = Security::decryptPassword($u['PASS']);
        }
        unset($u);

        return json_encode($users);
    }

    private static function update_group_user()
    {
        $userId = (int)$_SESSION['curGroupId'];
        $dbh    = Info::get('dbh');
        $id     = (int)self::$args['id'];
        $name   = mysqli_real_escape_string($dbh, self::$args['name']  ?? '');
        $login  = mysqli_real_escape_string($dbh, self::$args['login'] ?? '');
        $pass   = self::$args['pass'] ?? '';

        // Проверка прав: можно редактировать только себя, или всех если админ
        if (Security::canManageUsers()) {
            // Админ может редактировать всех в своей группе
            $check = Info::get('db')->get(
                "SELECT ID FROM users WHERE ID = {$id} AND (ID = {$userId} OR GROUP_ID = {$userId})"
            );
        } else {
            // Остальные могут редактировать только себя
            $check = Info::get('db')->get(
                "SELECT ID FROM users WHERE ID = {$id} AND ID = {$userId}"
            );
        }

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
        $userId = (int)$_SESSION['curGroupId'];
        $dbh    = Info::get('dbh');
        $role   = mysqli_real_escape_string($dbh, self::$args['role'] ?? '');

        $allowed = ['admin', 'leader', 'musician', 'preacher', 'tech'];
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

        $userId   = (int)$_SESSION['curGroupId'];
        $filename = 'placeholder_' . $userId . '.' . $ext;
        $target   = $uploadDir . $filename;

        if (move_uploaded_file($_FILES['image']['tmp_name'], $target)) {
            return json_encode(['status' => 'success', 'path' => '/images/placeholders/' . $filename]);
        }
        return json_encode(['status' => 'error', 'message' => 'Failed to move uploaded file']);
    }

    // ============================================================
    // GOOGLE OAUTH INTEGRATION
    // ============================================================

    /**
     * Get Google OAuth URL for account linking
     * Returns the URL where user should be redirected to link their Google account
     */
    private static function get_google_oauth_url()
    {
        $userId = (int)$_SESSION['curGroupId'];
        $targetUserId = isset(self::$args['user_id']) ? (int)self::$args['user_id'] : $userId;

        // Verify permission: can only link own account or group members
        $check = Info::get('db')->get(
            "SELECT ID FROM users WHERE ID = {$targetUserId} AND (ID = {$userId} OR GROUP_ID = {$userId})"
        );
        if (!$check) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }

        // Store target user ID in session for callback
        $_SESSION['google_link_user_id'] = $targetUserId;

        // Build Google OAuth URL
        $clientId = Info::get('config')['GOOGLE_CLIENT_ID'];
        if (!$clientId) {
            return json_encode(['status' => 'error', 'message' => 'Google OAuth not configured']);
        }

        $redirectUri = (isset($_SERVER['HTTPS']) ? 'https://' : 'http://') .
                       $_SERVER['HTTP_HOST'] . '/google-callback';

        $params = http_build_query([
            'client_id'     => $clientId,
            'redirect_uri'  => $redirectUri,
            'response_type' => 'code',
            'scope'         => 'openid email profile',
            'access_type'   => 'online',
            'prompt'        => 'select_account'
        ]);

        $authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' . $params;

        return json_encode(['status' => 'ok', 'url' => $authUrl]);
    }

    /**
     * Handle Google OAuth callback
     * Exchanges authorization code for user info and links Google account
     */
    private static function handle_google_callback()
    {
        $code = self::$args['code'] ?? '';
        if (!$code) {
            return json_encode(['status' => 'error', 'message' => 'No authorization code']);
        }

        $targetUserId = $_SESSION['google_link_user_id'] ?? null;
        if (!$targetUserId) {
            return json_encode(['status' => 'error', 'message' => 'Session expired']);
        }

        $clientId     = Info::get('config')['GOOGLE_CLIENT_ID'];
        $clientSecret = Info::get('config')['GOOGLE_CLIENT_SECRET'];

        if (!$clientId || !$clientSecret) {
            return json_encode(['status' => 'error', 'message' => 'Google OAuth not configured']);
        }

        $redirectUri = (isset($_SERVER['HTTPS']) ? 'https://' : 'http://') .
                       $_SERVER['HTTP_HOST'] . '/google-callback';

        // Exchange code for access token
        $tokenUrl = 'https://oauth2.googleapis.com/token';
        $tokenData = [
            'code'          => $code,
            'client_id'     => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri'  => $redirectUri,
            'grant_type'    => 'authorization_code'
        ];

        $ch = curl_init($tokenUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($tokenData));
        $tokenResponse = curl_exec($ch);
        curl_close($ch);

        $tokenJson = json_decode($tokenResponse, true);
        if (!isset($tokenJson['access_token'])) {
            return json_encode(['status' => 'error', 'message' => 'Failed to get access token']);
        }

        // Get user info from Google
        $userInfoUrl = 'https://www.googleapis.com/oauth2/v2/userinfo';
        $ch = curl_init($userInfoUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $tokenJson['access_token']
        ]);
        $userInfoResponse = curl_exec($ch);
        curl_close($ch);

        $userInfo = json_decode($userInfoResponse, true);
        if (!isset($userInfo['id'])) {
            return json_encode(['status' => 'error', 'message' => 'Failed to get user info']);
        }

        $googleId = mysqli_real_escape_string(Info::get('dbh'), $userInfo['id']);

        // Check if this Google account is already linked to another user
        $existing = Info::get('db')->get(
            "SELECT ID FROM users WHERE GOOGLE_ID = '{$googleId}' AND ID != {$targetUserId}"
        );
        if ($existing) {
            return json_encode(['status' => 'error', 'message' => 'This Google account is already linked to another user']);
        }

        // Link Google account to user
        Info::get('db')->exec(
            "UPDATE users SET GOOGLE_ID = '{$googleId}' WHERE ID = {$targetUserId}"
        );

        // Clean up session
        unset($_SESSION['google_link_user_id']);

        return json_encode([
            'status' => 'ok',
            'google_id' => $googleId,
            'google_email' => $userInfo['email'] ?? '',
            'google_name' => $userInfo['name'] ?? ''
        ]);
    }

    /**
     * Unlink Google account from user
     */
    private static function unlink_google_account()
    {
        $userId = (int)$_SESSION['curGroupId'];
        $targetUserId = isset(self::$args['user_id']) ? (int)self::$args['user_id'] : $userId;

        // Verify permission
        $check = Info::get('db')->get(
            "SELECT ID FROM users WHERE ID = {$targetUserId} AND (ID = {$userId} OR GROUP_ID = {$userId})"
        );
        if (!$check) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }

        Info::get('db')->exec(
            "UPDATE users SET GOOGLE_ID = NULL WHERE ID = {$targetUserId}"
        );

        return json_encode(['status' => 'ok']);
    }

    /**
     * Get Google account status for users
     */
    private static function get_google_account_status()
    {
        $userId = (int)$_SESSION['curGroupId'];
        $targetUserId = isset(self::$args['user_id']) ? (int)self::$args['user_id'] : $userId;

        $user = Info::get('db')->get(
            "SELECT ID, GOOGLE_ID FROM users
             WHERE ID = {$targetUserId} AND (ID = {$userId} OR GROUP_ID = {$userId})"
        );

        if (!$user) {
            return json_encode(['status' => 'error', 'message' => 'User not found']);
        }

        return json_encode([
            'status' => 'ok',
            'linked' => !empty($user['GOOGLE_ID']),
            'google_id' => $user['GOOGLE_ID'] ?? null
        ]);
    }
}
