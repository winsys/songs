<?php

class App
{
    public function run()
    {
        if (isset($_REQUEST['route'])) {
            $route = explode('/', $_REQUEST['route']);
        } else {
            $route = array();
        }
        $this->selectRoute($route);
    }

    private function selectRoute($route)
    {
        if (count($route) == 0) {
            if (!Security::isLoggedIn()) {
                header("Location: /login");
            } else {
                header("Location: " . Security::defaultRedirect());
            }
            exit;
        }

        if ($route[0] == 'logout') {
            Security::doLogout();
            header("Location: /login");
            exit;
        }

        // Google login initiation (before login check)
        if ($route[0] == 'google-login') {
            $this->initiateGoogleLogin();
            exit;
        }

        // Google OAuth callback (before login check)
        if ($route[0] == 'google-callback') {
            $this->handleGoogleCallback();
            exit;
        }

        // Google login callback (for authentication)
        if ($route[0] == 'google-login-callback') {
            // Check if this is a One Tap POST request with credential
            if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['credential'])) {
                $this->handleGoogleOneTapLogin();
            } else {
                $this->handleGoogleLoginCallback();
            }
            exit;
        }

        if (!Security::isLoggedIn()) {
            if (Security::loginRequest()) {
                if (Security::doLogin()) {
                    if (Security::isLoggedIn()) {
                        header("Location: " . Security::defaultRedirect());
                        exit;
                    }
                }
            }
            $this->render('login');
            exit;
        }

        // Access control
        if (!Security::canAccess($route[0])) {
            header("HTTP/1.1 403 Forbidden");
            echo '403 — недостаточно прав доступа.';
            exit;
        }

        switch ($route[0]) {
            case 'ajax':
                if (!empty($_FILES)) {
                    $cmds = $_POST;
                } else {
                    $cmds = json_decode(file_get_contents('php://input'), true);
                }
                echo Ajax::execute($cmds);
                break;
            case 'text':
                $this->render($route[0], null, 'text_layout');
                break;
            case 'text_stream':
                $this->render($route[0], null, 'text_layout_streaming');
                break;
            case 'sermon':
                $this->render($route[0], null, 'sermon_layout');
                break;
            default:
                $this->render($route[0], null);
                break;
        }
    }

    private function initiateGoogleLogin()
    {
        $clientId = Info::get('config')['GOOGLE_CLIENT_ID'];
        if (!$clientId) {
            echo '<!DOCTYPE html>
<html>
<head><title>Google Login Error</title></head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>❌ Ошибка</h2>
    <p>Google OAuth не настроен.</p>
    <p><a href="/login">Вернуться к входу</a></p>
</body>
</html>';
            return;
        }

        $redirectUri = (isset($_SERVER['HTTPS']) ? 'https://' : 'http://') .
                       $_SERVER['HTTP_HOST'] . '/google-login-callback';

        $params = http_build_query([
            'client_id'     => $clientId,
            'redirect_uri'  => $redirectUri,
            'response_type' => 'code',
            'scope'         => 'openid email profile',
            'access_type'   => 'online',
            'prompt'        => 'select_account'
        ]);

        $authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' . $params;
        header('Location: ' . $authUrl);
    }

    private function handleGoogleLoginCallback()
    {
        // Start session if not already started
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        // Get authorization code
        $code = $_GET['code'] ?? '';
        if (!$code) {
            echo '<!DOCTYPE html>
<html>
<head><title>Google Login Error</title></head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>❌ Ошибка</h2>
    <p>Отсутствует код авторизации от Google.</p>
    <p><a href="/login">Вернуться к входу</a></p>
</body>
</html>';
            return;
        }

        $clientId     = Info::get('config')['GOOGLE_CLIENT_ID'];
        $clientSecret = Info::get('config')['GOOGLE_CLIENT_SECRET'];

        if (!$clientId || !$clientSecret) {
            echo '<!DOCTYPE html>
<html>
<head><title>Google Login Error</title></head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>❌ Ошибка</h2>
    <p>Google OAuth не настроен.</p>
    <p><a href="/login">Вернуться к входу</a></p>
</body>
</html>';
            return;
        }

        $redirectUri = (isset($_SERVER['HTTPS']) ? 'https://' : 'http://') .
                       $_SERVER['HTTP_HOST'] . '/google-login-callback';

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
            echo '<!DOCTYPE html>
<html>
<head><title>Google Login Error</title></head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>❌ Ошибка</h2>
    <p>Не удалось получить токен доступа от Google.</p>
    <p><a href="/login">Вернуться к входу</a></p>
</body>
</html>';
            return;
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
            echo '<!DOCTYPE html>
<html>
<head><title>Google Login Error</title></head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>❌ Ошибка</h2>
    <p>Не удалось получить информацию о пользователе от Google.</p>
    <p><a href="/login">Вернуться к входу</a></p>
</body>
</html>';
            return;
        }

        $googleId = $userInfo['id'];

        // Find user by Google ID
        $user = Info::get('db')->get(
            "SELECT ID, NAME, ROLE, GROUP_ID FROM users WHERE GOOGLE_ID = '" .
            mysqli_real_escape_string(Info::get('dbh'), $googleId) . "'"
        );

        if (!$user) {
            echo '<!DOCTYPE html>
<html>
<head><title>Google Login Error</title></head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>❌ Аккаунт не привязан</h2>
    <p>Ваш Google аккаунт (<strong>' . htmlspecialchars($userInfo['email']) . '</strong>) не привязан ни к одному пользователю системы.</p>
    <p>Войдите с помощью логина и пароля, затем привяжите Google аккаунт в настройках.</p>
    <p><a href="/login">Вернуться к входу</a></p>
</body>
</html>';
            return;
        }

        // Log in the user - IMPORTANT: set loggedIn flag!
        $_SESSION['loggedIn'] = true;
        $_SESSION['curGroupId'] = isset($user['GROUP_ID']) && $user['GROUP_ID'] > 0
            ? (int)$user['GROUP_ID']
            : (int)$user['ID'];
        $_SESSION['userName'] = $user['NAME'];
        $_SESSION['userRole'] = $user['ROLE'] ?? 'musician';
        $_SESSION['loginError'] = '';

        // Update last login time
        Info::get('db')->exec(
            "UPDATE users SET LAST_LOGIN = NOW() WHERE ID = " . (int)$user['ID']
        );

        // Regenerate session ID for security
        session_regenerate_id(true);

        // Redirect to default page
        echo '<!DOCTYPE html>
<html>
<head>
    <title>Google Login Success</title>
    <script>window.location.href = "' . Security::defaultRedirect() . '";</script>
    <meta http-equiv="refresh" content="0;url=' . Security::defaultRedirect() . '">
</head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>✅ Успешный вход!</h2>
    <p>Добро пожаловать, <strong>' . htmlspecialchars($user['NAME']) . '</strong>!</p>
    <p>Перенаправление...</p>
</body>
</html>';
    }

    private function handleGoogleOneTapLogin()
    {
        // Start session if not already started
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        $credential = $_POST['credential'] ?? '';
        if (!$credential) {
            echo json_encode(['error' => 'No credential provided']);
            return;
        }

        $clientId = Info::get('config')['GOOGLE_CLIENT_ID'];
        if (!$clientId) {
            echo json_encode(['error' => 'Google OAuth not configured']);
            return;
        }

        // Decode JWT (it has 3 parts: header.payload.signature)
        $parts = explode('.', $credential);
        if (count($parts) !== 3) {
            echo json_encode(['error' => 'Invalid credential format']);
            return;
        }

        // Decode payload (second part)
        $payload = json_decode(base64_decode(strtr($parts[1], '-_', '+/')), true);
        if (!$payload) {
            echo json_encode(['error' => 'Failed to decode credential']);
            return;
        }

        // Verify the token is for our client
        if ($payload['aud'] !== $clientId) {
            echo json_encode(['error' => 'Invalid audience']);
            return;
        }

        // Verify token hasn't expired
        if (isset($payload['exp']) && $payload['exp'] < time()) {
            echo json_encode(['error' => 'Token expired']);
            return;
        }

        $googleId = $payload['sub'] ?? '';
        if (!$googleId) {
            echo json_encode(['error' => 'No Google ID in token']);
            return;
        }

        // Find user by Google ID
        $user = Info::get('db')->get(
            "SELECT ID, NAME, ROLE, GROUP_ID FROM users WHERE GOOGLE_ID = '" .
            mysqli_real_escape_string(Info::get('dbh'), $googleId) . "'"
        );

        if (!$user) {
            echo '<!DOCTYPE html>
<html>
<head><title>Google Login Error</title></head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>❌ Аккаунт не привязан</h2>
    <p>Ваш Google аккаунт (<strong>' . htmlspecialchars($payload['email'] ?? '') . '</strong>) не привязан ни к одному пользователю системы.</p>
    <p>Войдите с помощью логина и пароля, затем привяжите Google аккаунт в настройках.</p>
    <p><a href="/login">Вернуться к входу</a></p>
</body>
</html>';
            return;
        }

        // Log in the user - IMPORTANT: set loggedIn flag!
        $_SESSION['loggedIn'] = true;
        $_SESSION['curGroupId'] = isset($user['GROUP_ID']) && $user['GROUP_ID'] > 0
            ? (int)$user['GROUP_ID']
            : (int)$user['ID'];
        $_SESSION['userName'] = $user['NAME'];
        $_SESSION['userRole'] = $user['ROLE'] ?? 'musician';
        $_SESSION['loginError'] = '';

        // Update last login time
        Info::get('db')->exec(
            "UPDATE users SET LAST_LOGIN = NOW() WHERE ID = " . (int)$user['ID']
        );

        // Regenerate session ID for security
        session_regenerate_id(true);

        // Redirect to default page
        echo '<!DOCTYPE html>
<html>
<head>
    <title>Google Login Success</title>
    <script>window.location.href = "' . Security::defaultRedirect() . '";</script>
    <meta http-equiv="refresh" content="0;url=' . Security::defaultRedirect() . '">
</head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>✅ Успешный вход!</h2>
    <p>Добро пожаловать, <strong>' . htmlspecialchars($user['NAME']) . '</strong>!</p>
    <p>Перенаправление...</p>
</body>
</html>';
    }

    private function handleGoogleCallback()
    {
        // Start session if not already started
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        // Check if user is logged in
        if (!Security::isLoggedIn()) {
            echo '<!DOCTYPE html>
<html>
<head><title>Google Auth Error</title></head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>❌ Ошибка авторизации</h2>
    <p>Вы должны быть авторизованы для привязки Google аккаунта.</p>
    <p><a href="/login">Войти в систему</a></p>
</body>
</html>';
            return;
        }

        // Get authorization code from query string
        $code = $_GET['code'] ?? '';
        if (!$code) {
            echo '<!DOCTYPE html>
<html>
<head><title>Google Auth Error</title></head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>❌ Ошибка</h2>
    <p>Отсутствует код авторизации от Google.</p>
    <p><a href="/settings">Вернуться в настройки</a></p>
</body>
</html>';
            return;
        }

        // Call Ajax handler
        $result = Ajax::execute([
            'command' => 'handle_google_callback',
            'code' => $code
        ]);

        $resultData = json_decode($result, true);

        if ($resultData && $resultData['status'] === 'ok') {
            // Success
            echo '<!DOCTYPE html>
<html>
<head>
    <title>Google Account Linked</title>
    <meta http-equiv="refresh" content="3;url=/settings">
</head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>✅ Успешно!</h2>
    <p>Google аккаунт успешно привязан.</p>
    <p>Email: <strong>' . htmlspecialchars($resultData['google_email'] ?? '') . '</strong></p>
    <p>Перенаправление в настройки через 3 секунды...</p>
    <p><a href="/settings">Перейти сейчас</a></p>
</body>
</html>';
        } else {
            // Error
            $errorMsg = $resultData['message'] ?? 'Unknown error';
            echo '<!DOCTYPE html>
<html>
<head><title>Google Auth Error</title></head>
<body style="font-family: Arial; padding: 40px; text-align: center;">
    <h2>❌ Ошибка привязки</h2>
    <p>' . htmlspecialchars($errorMsg) . '</p>
    <p><a href="/settings">Вернуться в настройки</a></p>
</body>
</html>';
        }
    }

    private function render($view, $param = null, $layout = null)
    {
        $userId = (int)($_SESSION['curGroupId'] ?? 0);
        $viewFile = '../templates/' . $view . '.html';
        if (is_readable($viewFile)) {
            ob_start();
            include $viewFile;
            $pageContent = ob_get_contents();
            ob_end_clean();
        } else {
            $pageContent = 'no content';
        }

        $layoutFile = is_null($layout)
            ? '../templates/layout.html'
            : '../templates/' . $layout . '.html';

        ob_start();
        include $layoutFile;
        $html = ob_get_contents();
        ob_end_clean();

        echo $html;
    }
}