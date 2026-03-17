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
            GoogleAuth::initiateLogin();
            exit;
        }

        // Google OAuth callback (before login check)
        if ($route[0] == 'google-callback') {
            GoogleAuth::handleAccountLinking();
            exit;
        }

        // Google login callback (for authentication)
        if ($route[0] == 'google-login-callback') {
            // Check if this is a One Tap POST request with credential
            if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['credential'])) {
                GoogleAuth::handleOneTapLogin();
            } else {
                GoogleAuth::handleLoginCallback();
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