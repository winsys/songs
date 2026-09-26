<?php

class App
{
    public function run()
    {
        // No PHP session (browser restarted, PWA opened from the installed
        // icon) — transparently log in from the "remember me" cookie before
        // any routing, so every page and /ajax sees a normal session.
        if (!Security::isLoggedIn()) {
            RememberMe::consume();
        }

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

        // Observer auto-login link / QR code: /join/<token> (before login check)
        if ($route[0] == 'join') {
            $token = isset($route[1]) ? (string)$route[1] : '';
            header("Location: " . (Security::joinByToken($token) ? '/observer' : '/login'));
            exit;
        }

        // Public signup-request endpoints (before login check)
        if ($route[0] == 'signup-request') {
            Signup::handleRequestForm();
            exit;
        }
        if ($route[0] == 'signup-confirm') {
            Signup::handleConfirm();
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

        // /login is never a destination of a signed-in user: iPhone Safari
        // autocompletes the typed domain to the last visited /login, the
        // "remember me" cookie signs the user in on that very request, and
        // the role check below used to answer 403 until the site data was
        // cleared. Send such a request home instead (a submitted login form
        // still switches the account).
        if (!Security::isLoggedIn() || $route[0] == 'login') {
            if (Security::loginRequest()) {
                Security::doLogin();
            }
            if (Security::isLoggedIn()) {
                header("Location: " . Security::defaultRedirect());
                exit;
            }
            $this->render('login');
            exit;
        }

        // Access control. A page the role may not open is usually a stale
        // address (browser autocomplete, a phone switched to the shared
        // observer login), so a plain page load lands on the home page, which
        // every role may open — no redirect loop. Anything else stays 403.
        if (!Security::canAccess($route[0])) {
            $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
            if ($method === 'GET' || $method === 'HEAD') {
                header("Location: " . Security::defaultRedirect());
                exit;
            }
            header("HTTP/1.1 403 Forbidden");
            echo '403 — Access denied.';
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