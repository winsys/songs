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

        // Google OAuth callback (before login check)
        if ($route[0] == 'google-callback') {
            $this->handleGoogleCallback();
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
        $userId = (int)($_SESSION['userId'] ?? 0);
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