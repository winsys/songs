<?php

/**
 * Google OAuth handler.
 * Extracted from App.php — отвечает за все сценарии Google-авторизации:
 *   - инициация OAuth-потока (initiateLogin)
 *   - обработка callback после логина (handleLoginCallback)
 *   - обработка Google One Tap (handleOneTapLogin)
 *   - привязка Google-аккаунта к существующему пользователю (handleAccountLinking)
 */
class GoogleAuth
{
    // =========================================================
    //  Public entry points (вызываются из App::selectRoute)
    // =========================================================

    public static function initiateLogin(): void
    {
        $clientId = Info::get('config')['GOOGLE_CLIENT_ID'] ?? '';
        if (!$clientId) {
            self::renderError('Google OAuth не настроен.', '/login', 'Вернуться к входу');
            return;
        }

        $params = http_build_query([
            'client_id'     => $clientId,
            'redirect_uri'  => self::getLoginCallbackUri(),
            'response_type' => 'code',
            'scope'         => 'openid email profile',
            'access_type'   => 'online',
            'prompt'        => 'select_account',
        ]);

        header('Location: https://accounts.google.com/o/oauth2/v2/auth?' . $params);
    }

    public static function handleLoginCallback(): void
    {
        $code = $_GET['code'] ?? '';
        if (!$code) {
            self::renderError('Отсутствует код авторизации от Google.', '/login', 'Вернуться к входу');
            return;
        }

        $clientId     = Info::get('config')['GOOGLE_CLIENT_ID']     ?? '';
        $clientSecret = Info::get('config')['GOOGLE_CLIENT_SECRET'] ?? '';
        if (!$clientId || !$clientSecret) {
            self::renderError('Google OAuth не настроен.', '/login', 'Вернуться к входу');
            return;
        }

        // Обменять код на access token
        $tokenJson = self::exchangeCodeForToken($code, $clientId, $clientSecret);
        if (!isset($tokenJson['access_token'])) {
            self::renderError('Не удалось получить токен доступа от Google.', '/login', 'Вернуться к входу');
            return;
        }

        // Получить профиль пользователя от Google
        $userInfo = self::fetchGoogleUserInfo($tokenJson['access_token']);
        if (!isset($userInfo['id'])) {
            self::renderError('Не удалось получить информацию о пользователе от Google.', '/login', 'Вернуться к входу');
            return;
        }

        $user = self::findUserByGoogleId($userInfo['id']);
        if (!$user) {
            self::renderError(
                'Ваш Google аккаунт (<strong>' . htmlspecialchars($userInfo['email'] ?? '') . '</strong>) '
                . 'не привязан ни к одному пользователю системы.<br>'
                . 'Войдите с помощью логина и пароля, затем привяжите Google аккаунт в настройках.',
                '/login',
                'Вернуться к входу'
            );
            return;
        }

        Security::startUserSession($user);
        self::renderSuccessPage($user['NAME'], Security::defaultRedirect());
    }

    public static function handleOneTapLogin(): void
    {
        $credential = $_POST['credential'] ?? '';
        if (!$credential) {
            echo json_encode(['error' => 'No credential provided']);
            return;
        }

        $clientId = Info::get('config')['GOOGLE_CLIENT_ID'] ?? '';
        if (!$clientId) {
            echo json_encode(['error' => 'Google OAuth not configured']);
            return;
        }

        // Декодировать JWT (header.payload.signature)
        $parts = explode('.', $credential);
        if (count($parts) !== 3) {
            echo json_encode(['error' => 'Invalid credential format']);
            return;
        }

        $payload = json_decode(base64_decode(strtr($parts[1], '-_', '+/')), true);
        if (!$payload) {
            echo json_encode(['error' => 'Failed to decode credential']);
            return;
        }

        if (($payload['aud'] ?? '') !== $clientId) {
            echo json_encode(['error' => 'Invalid audience']);
            return;
        }

        if (isset($payload['exp']) && $payload['exp'] < time()) {
            echo json_encode(['error' => 'Token expired']);
            return;
        }

        $googleId = $payload['sub'] ?? '';
        if (!$googleId) {
            echo json_encode(['error' => 'No Google ID in token']);
            return;
        }

        $user = self::findUserByGoogleId($googleId);
        if (!$user) {
            self::renderError(
                'Ваш Google аккаунт (<strong>' . htmlspecialchars($payload['email'] ?? '') . '</strong>) '
                . 'не привязан ни к одному пользователю системы.<br>'
                . 'Войдите с помощью логина и пароля, затем привяжите Google аккаунт в настройках.',
                '/login',
                'Вернуться к входу'
            );
            return;
        }

        Security::startUserSession($user);
        self::renderSuccessPage($user['NAME'], Security::defaultRedirect());
    }

    public static function handleAccountLinking(): void
    {
        if (!Security::isLoggedIn()) {
            self::renderError(
                'Вы должны быть авторизованы для привязки Google аккаунта.',
                '/login',
                'Войти в систему'
            );
            return;
        }

        $code = $_GET['code'] ?? '';
        if (!$code) {
            self::renderError('Отсутствует код авторизации от Google.', '/settings', 'Вернуться в настройки');
            return;
        }

        $result     = Ajax::execute(['command' => 'handle_google_callback', 'code' => $code]);
        $resultData = json_decode($result, true);

        if ($resultData && $resultData['status'] === 'ok') {
            $email = htmlspecialchars($resultData['google_email'] ?? '');
            echo '<!DOCTYPE html>
<html>
<head>
    <title>Google Account Linked</title>
    <meta http-equiv="refresh" content="3;url=/settings">
</head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>✅ Успешно!</h2>
    <p>Google аккаунт успешно привязан.</p>
    <p>Email: <strong>' . $email . '</strong></p>
    <p>Перенаправление в настройки через 3 секунды...</p>
    <p><a href="/settings">Перейти сейчас</a></p>
</body>
</html>';
        } else {
            $errorMsg = htmlspecialchars($resultData['message'] ?? 'Unknown error');
            self::renderError($errorMsg, '/settings', 'Вернуться в настройки');
        }
    }

    // =========================================================
    //  Private helpers
    // =========================================================

    /**
     * Найти пользователя по Google ID: сначала в таблице user_google_accounts,
     * затем fallback на старую колонку GOOGLE_ID в users (совместимость с миграцией).
     */
    private static function findUserByGoogleId(string $googleId): ?array
    {
        $db        = Info::get('db');
        $safeId    = mysqli_real_escape_string(Info::get('dbh'), $googleId);

        $googleAccount = $db->get(
            "SELECT user_id FROM user_google_accounts WHERE google_id = '{$safeId}'"
        );

        if (!$googleAccount) {
            // Fallback: старая колонка (для совместимости при миграции)
            return $db->get(
                "SELECT ID, NAME, ROLE, GROUP_ID FROM users WHERE GOOGLE_ID = '{$safeId}'"
            );
        }

        $userId = (int)$googleAccount['user_id'];
        $user   = $db->get(
            "SELECT ID, NAME, ROLE, GROUP_ID FROM users WHERE ID = {$userId}"
        );

        // Обновить временную метку последнего использования
        $db->exec(
            "UPDATE user_google_accounts SET last_used = NOW() WHERE google_id = '{$safeId}'"
        );

        return $user ?: null;
    }

    /**
     * Получить URI для Google OAuth callback (логин).
     */
    private static function getLoginCallbackUri(): string
    {
        $scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        return $scheme . '://' . $_SERVER['HTTP_HOST'] . '/google-login-callback';
    }

    /**
     * Обменять авторизационный код на токен Google.
     */
    private static function exchangeCodeForToken(string $code, string $clientId, string $clientSecret): array
    {
        $ch = curl_init('https://oauth2.googleapis.com/token');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
            'code'          => $code,
            'client_id'     => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri'  => self::getLoginCallbackUri(),
            'grant_type'    => 'authorization_code',
        ]));
        $response = curl_exec($ch);
        curl_close($ch);
        return json_decode($response, true) ?? [];
    }

    /**
     * Получить профиль пользователя от Google по access token.
     */
    private static function fetchGoogleUserInfo(string $accessToken): array
    {
        $ch = curl_init('https://www.googleapis.com/oauth2/v2/userinfo');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $accessToken]);
        $response = curl_exec($ch);
        curl_close($ch);
        return json_decode($response, true) ?? [];
    }

    /**
     * Вывести простую HTML-страницу с ошибкой.
     * Используется вместо повторяющихся inline-строк с HTML.
     */
    private static function renderError(string $message, string $backUrl, string $backLabel): void
    {
        echo '<!DOCTYPE html>
<html>
<head><title>Ошибка авторизации</title></head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>❌ Ошибка</h2>
    <p>' . $message . '</p>
    <p><a href="' . htmlspecialchars($backUrl) . '">' . htmlspecialchars($backLabel) . '</a></p>
</body>
</html>';
    }

    /**
     * Вывести страницу успешного входа с мгновенным редиректом.
     */
    private static function renderSuccessPage(string $userName, string $redirectUrl): void
    {
        $safeName        = htmlspecialchars($userName);
        $safeRedirectUrl = htmlspecialchars($redirectUrl);
        echo '<!DOCTYPE html>
<html>
<head>
    <title>Успешный вход</title>
    <script>window.location.href = "' . $safeRedirectUrl . '";</script>
    <meta http-equiv="refresh" content="0;url=' . $safeRedirectUrl . '">
</head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>✅ Успешный вход!</h2>
    <p>Добро пожаловать, <strong>' . $safeName . '</strong>!</p>
    <p>Перенаправление...</p>
</body>
</html>';
    }
}
