<?php

class Security
{

    private $db;

    public function __construct()
    {
        $this->db = Info::get('db');
    }

    // ============================================================
    //  [SECURITY #1] AES-256-CBC шифрование/расшифровка паролей
    //  Пароли хранятся в виде: "enc:" + base64(iv + ciphertext)
    //  Ключ берётся из config_example.php → 'encryption_key'
    // ============================================================

    /**
     * Зашифровать пароль для хранения в базе данных.
     * Возвращает строку вида "enc:<base64>"
     */
    public static function encryptPassword(string $plaintext): string
    {
        $key = self::getEncKey();
        $iv = random_bytes(16);
        $cipher = openssl_encrypt($plaintext, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv);
        return 'enc:' . base64_encode($iv . $cipher);
    }

    /**
     * Расшифровать пароль из базы данных.
     * Если пароль не зашифрован (миграция) — возвращает как есть.
     */
    public static function decryptPassword(string $stored): string
    {
        if (strncmp($stored, 'enc:', 4) !== 0) {
            // Старый plaintext — вернуть как есть (пока не прошла миграция)
            return $stored;
        }
        $key = self::getEncKey();
        $raw = base64_decode(substr($stored, 4));
        $iv = substr($raw, 0, 16);
        $data = substr($raw, 16);
        $dec = openssl_decrypt($data, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv);
        return ($dec === false) ? '' : $dec;
    }

    /**
     * Проверить, зашифрован ли пароль в базе данных.
     */
    public static function isEncrypted(string $stored): bool
    {
        return strncmp($stored, 'enc:', 4) === 0;
    }

    private static function getEncKey(): string
    {
        $conf = Info::get('config');
        $key = base64_decode($conf['encryption_key'] ?? '');
        if (strlen($key) < 16) {
            throw new \RuntimeException('encryption_key в config_example.php не задан или слишком короткий.');
        }
        return $key;
    }

    // ============================================================
    //  [SECURITY #3] CSRF-защита
    // ============================================================

    /**
     * Сгенерировать и сохранить CSRF-токен в сессии (вызывается при старте).
     */
    public static function initCsrfToken(): void
    {
        if (empty($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
    }

    /**
     * Вернуть текущий CSRF-токен для вставки на страницу.
     */
    public static function getCsrfToken(): string
    {
        return $_SESSION['csrf_token'] ?? '';
    }

    /**
     * Проверить CSRF-токен из заголовка X-CSRF-Token или POST-поля _csrf_token.
     * Возвращает false если токен неверен.
     */
    public static function validateCsrf(): bool
    {
        $sessionToken = $_SESSION['csrf_token'] ?? '';
        if ($sessionToken === '') {
            return false;
        }

        // Заголовок (для JSON-запросов AngularJS)
        $headerToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if ($headerToken !== '' && hash_equals($sessionToken, $headerToken)) {
            return true;
        }

        // POST-поле (для multipart file uploads)
        $postToken = $_POST['_csrf_token'] ?? '';
        if ($postToken !== '' && hash_equals($sessionToken, $postToken)) {
            return true;
        }

        return false;
    }

    // ============================================================
    //  Аутентификация
    // ============================================================

    public static function isLoggedIn(): bool
    {
        return isset($_SESSION['loggedIn']) && $_SESSION['loggedIn'] === true;
    }

    public static function loginRequest(): bool
    {
        return isset($_POST['login']) && isset($_POST['pass']);
    }

    /**
     * Записать данные пользователя в сессию и обновить last_login.
     * Единая точка входа — используется при любом способе авторизации
     * (пароль, Google OAuth, Google One Tap).
     */
    public static function startUserSession(array $user): void
    {
        $_SESSION['loggedIn']   = true;
        $_SESSION['curUserId']  = (int)$user['ID'];
        $_SESSION['curGroupId'] = (isset($user['GROUP_ID']) && $user['GROUP_ID'] > 0)
            ? (int)$user['GROUP_ID']
            : (int)$user['ID'];
        $_SESSION['userName']   = $user['NAME'];
        $_SESSION['userRole']   = $user['ROLE'] ?? 'musician';
        $_SESSION['loginError'] = '';

        Info::get('db')->exec(
            'UPDATE users SET LAST_LOGIN = NOW() WHERE ID = ' . (int)$user['ID']
        );

        session_regenerate_id(true);
    }

    /**
     * [SECURITY #1] Логин: сначала пробует зашифрованный пароль,
     * при первом совпадении с plaintext — автоматически мигрирует в enc:.
     */
    public static function doLogin(): bool
    {
        $db = Info::get('db');
        $login = $db->db_handle()->real_escape_string($_POST['login']);
        // Ищем пользователя только по логину (без сравнения пароля в SQL!)
        $user = $db->get("SELECT * FROM users WHERE login='{$login}' LIMIT 1");

        if (!$user) {
            $_SESSION['loggedIn'] = false;
            $_SESSION['loginError'] = 'Invalid credentials';
            return false;
        }

        $storedPass = $user['PASS'] ?? '';
        $inputPass = $_POST['pass'];

        $passwordOk = false;

        if (self::isEncrypted($storedPass)) {
            // Новый формат: расшифровать и сравнить
            $passwordOk = hash_equals(self::decryptPassword($storedPass), $inputPass);
        } else {
            // Старый plaintext формат — сравниваем и мигрируем автоматически
            $passwordOk = hash_equals($storedPass, $inputPass);
            if ($passwordOk) {
                // Мигрировать пароль в зашифрованный формат прямо сейчас
                $encrypted = self::encryptPassword($inputPass);
                $escapedEnc = $db->db_handle()->real_escape_string($encrypted);
                $id = (int)$user['ID'];
                $db->exec("UPDATE users SET PASS='{$escapedEnc}' WHERE ID={$id}");
            }
        }

        if ($passwordOk) {
            self::startUserSession($user);
            return true;
        }

        $_SESSION['loggedIn'] = false;
        $_SESSION['loginError'] = 'Invalid credentials';
        return false;
    }

    public static function doLogout(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000,
                $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
    }

    // ============================================================
    //  Роли и маршруты
    // ============================================================

    public static function getRole(): string
    {
        return isset($_SESSION['userRole']) ? $_SESSION['userRole'] : 'musician';
    }

    public static function isAdmin(): bool
    {
        return self::getRole() === 'admin';
    }

    public static function isLeader(): bool
    {
        return self::getRole() === 'leader';
    }

    public static function isMusician(): bool
    {
        return self::getRole() === 'musician';
    }

    public static function isPreacher(): bool
    {
        return self::getRole() === 'preacher';
    }

    public static function isTech(): bool
    {
        return self::getRole() === 'tech';
    }

    public static function isScreen(): bool
    {
        return self::getRole() === 'screen';
    }

    private static $roleRoutes = array(
        'admin' => null,
        'leader' => array('index', 'ajax', 'leader', 'tech', 'settings'),
        'musician' => array('index', 'ajax', 'musician', 'settings'),
        'preacher' => array('index', 'ajax', 'sermon_prep', 'sermon', 'settings'),
        'tech' => array('index', 'ajax', 'tech', 'text', 'text_stream', 'settings'),
        'screen' => array('index', 'ajax', 'text', 'text_stream', 'settings'),
    );

    public static function canAccess(string $route): bool
    {
        $role = self::getRole();
        if ($role === 'admin') return true;

        $allowed = isset(self::$roleRoutes[$role])
            ? self::$roleRoutes[$role]
            : array('index', 'ajax');
        return in_array($route, $allowed);
    }

    public static function defaultRedirect(): string
    {
        return '/index';
    }

    // ============================================================
    //  [SECURITY] WebSocket Authentication Token
    // ============================================================

    /**
     * Generate WebSocket authentication token for current user.
     * Token is HMAC-SHA256 of userId with encryption key.
     * @return string
     */
    public static function generateWebSocketToken(): string
    {
        $config = Info::get('config');
        $userId = isset($_SESSION['curUserId']) ? (int)$_SESSION['curUserId'] : 0;
        return hash_hmac('sha256', $userId, $config['encryption_key']);
    }

    /**
     * Get current user's real ID (not group ID).
     * @return int
     */
    public static function getCurrentUserId(): int
    {
        return isset($_SESSION['curUserId']) ? (int)$_SESSION['curUserId'] : 0;
    }

    /**
     * Get current user's group ID for WebSocket connection.
     * @return int
     */
    public static function getGroupId(): int
    {
        return isset($_SESSION['curGroupId']) ? (int)$_SESSION['curGroupId'] : 0;
    }

    // ============================================================
    //  [PERMISSIONS] Settings Access Control
    // ============================================================

    /**
     * Check if user can edit group users (manage other users).
     * Only admin can edit all users.
     * @return bool
     */
    public static function canManageUsers(): bool
    {
        return self::isAdmin();
    }

    /**
     * Check if user can edit favorites order settings.
     * Leader and Admin can edit.
     * @return bool
     */
    public static function canEditFavoritesOrder(): bool
    {
        return self::isAdmin() || self::isLeader();
    }

    /**
     * Check if user can edit available song lists settings.
     * Leader and Admin can edit.
     * @return bool
     */
    public static function canEditSongLists(): bool
    {
        return self::isAdmin() || self::isLeader();
    }

    /**
     * Check if user can edit sermon display settings.
     * Preacher and Admin can edit.
     * @return bool
     */
    public static function canEditSermonSettings(): bool
    {
        return self::isAdmin() || self::isPreacher();
    }

    /**
     * Check if user can edit all display settings.
     * Tech and Admin can edit.
     * @return bool
     */
    public static function canEditAllSettings(): bool
    {
        return self::isAdmin() || self::isTech();
    }

    /**
     * Get permissions array for current user.
     * @return array
     */
    public static function canEditLanguages(): bool
    {
        return self::isAdmin() || self::isLeader();
    }

    public static function getSettingsPermissions(): array
    {
        return [
            'canManageUsers' => self::canManageUsers(),
            'canEditFavoritesOrder' => self::canEditFavoritesOrder(),
            'canEditSongLists' => self::canEditSongLists(),
            'canEditSermonSettings' => self::canEditSermonSettings(),
            'canEditAllSettings' => self::canEditAllSettings(),
            'canEditLanguages' => self::canEditLanguages(),
        ];
    }

}
