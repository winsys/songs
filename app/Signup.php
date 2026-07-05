<?php

/**
 * Signup — public "request access" workflow for new church groups.
 *
 * Flow:
 *   1. The login page form POSTs to /signup-request (public route).
 *      The application is stored in signup_requests and an email with
 *      approve/reject links is sent to the site owner (ADMIN_EMAIL).
 *   2. The owner clicks a link → /signup-confirm?token=…&action=approve|reject.
 *      On approve: an admin user (= new group, GROUP_ID = 0) is created with a
 *      generated login and the password from the application, a user_settings
 *      row with the chosen UI language and the city as display name is
 *      inserted, and the applicant receives an email with credentials and the
 *      site link. On reject the request is only marked rejected.
 *
 * The applicant's password is stored encrypted (same "enc:" scheme as
 * users.PASS) and is inserted into users as-is on approval.
 */
class Signup
{
    private const ADMIN_EMAIL = 'pavel@winsys.lv';
    private const MAIL_FROM   = 'Worship Songs <no-reply@winsys.lv>';
    private const UI_LANGS    = ['ru', 'de', 'en', 'lt'];

    /** Handle POST /signup-request from the login page form. */
    public static function handleRequestForm(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            header('Location: /login');
            return;
        }
        // Honeypot: bots fill every field; humans never see this one.
        if (!empty($_POST['website'])) {
            header('Location: /login?signup=sent');
            return;
        }
        if (!Security::validateCsrf()) {
            header('Location: /login?signup=error');
            return;
        }
        // Throttle: one application per session per minute.
        if (isset($_SESSION['last_signup_request']) &&
            time() - (int)$_SESSION['last_signup_request'] < 60) {
            header('Location: /login?signup=throttled');
            return;
        }

        $city     = self::cleanText($_POST['city'] ?? '');
        $email    = trim((string)($_POST['email'] ?? ''));
        $name     = self::cleanText($_POST['admin_name'] ?? '');
        $pass     = (string)($_POST['admin_pass'] ?? '');
        $lang     = (string)($_POST['ui_lang'] ?? 'en');
        $comments = self::cleanText($_POST['comments'] ?? '');

        if ($city === '' || $name === '' || strlen($pass) < 6 ||
            !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            header('Location: /login?signup=invalid');
            return;
        }
        if (!in_array($lang, self::UI_LANGS, true)) {
            $lang = 'en';
        }

        $token   = bin2hex(random_bytes(32));
        $encPass = Security::encryptPassword($pass);

        Info::get('db')->exec(
            "INSERT INTO signup_requests (token, city, email, admin_name, admin_pass, ui_lang, comments)
             VALUES ('" . self::esc($token) . "', '" . self::esc($city) . "', '" . self::esc($email) . "',
                     '" . self::esc(mb_substr($name, 0, 64, 'UTF-8')) . "', '" . self::esc($encPass) . "',
                     '" . self::esc($lang) . "', '" . self::esc($comments) . "')"
        );

        $base = self::baseUrl();
        $body = "Новая заявка на подключение Worship Songs\n\n"
              . "Город: {$city}\n"
              . "E-mail: {$email}\n"
              . "Администратор: {$name}\n"
              . "Язык интерфейса: {$lang}\n"
              . "Комментарий: " . ($comments !== '' ? $comments : '—') . "\n\n"
              . "Подтвердить регистрацию:\n"
              . "{$base}/signup-confirm?token={$token}&action=approve\n\n"
              . "Отклонить заявку:\n"
              . "{$base}/signup-confirm?token={$token}&action=reject\n";

        $sent = self::sendMail(self::ADMIN_EMAIL, 'Заявка на подключение: ' . $city, $body);

        $_SESSION['last_signup_request'] = time();
        header('Location: /login?signup=' . ($sent ? 'sent' : 'error'));
    }

    /** Handle GET /signup-confirm?token=…&action=approve|reject (owner's email links). */
    public static function handleConfirm(): void
    {
        $token  = (string)($_GET['token'] ?? '');
        $action = (string)($_GET['action'] ?? '');

        if (!preg_match('/^[0-9a-f]{64}$/', $token) ||
            !in_array($action, ['approve', 'reject'], true)) {
            self::renderResult('Неверная ссылка', 'Ссылка повреждена или неполная.');
            return;
        }

        $escToken = self::esc($token);
        $req = Info::get('db')->get(
            "SELECT * FROM signup_requests WHERE token = '{$escToken}' LIMIT 1"
        );
        if (!$req) {
            self::renderResult('Заявка не найдена', 'Возможно, ссылка устарела.');
            return;
        }
        if ($req['status'] !== 'pending') {
            self::renderResult('Заявка уже обработана',
                'Текущий статус: ' . $req['status'] . ' (' . $req['processed_at'] . ').');
            return;
        }

        // Atomic claim — protects against a double click on the email link.
        $newStatus = $action === 'approve' ? 'approved' : 'rejected';
        Info::get('db')->exec(
            "UPDATE signup_requests SET status = '{$newStatus}', processed_at = NOW()
             WHERE token = '{$escToken}' AND status = 'pending'"
        );
        if (Info::get('dbh')->affected_rows !== 1) {
            self::renderResult('Заявка уже обработана', 'Похоже, ссылка была открыта дважды.');
            return;
        }

        if ($action === 'reject') {
            self::renderResult('Заявка отклонена',
                'Пользователь не создан. Письмо заявителю не отправлялось.');
            return;
        }

        // ── Approve: create the admin user (new group) ────────────
        $name  = mb_substr($req['admin_name'], 0, 64, 'UTF-8');
        $login = self::generateLogin($name);

        Info::get('db')->exec(
            "INSERT INTO users (NAME, LOGIN, PASS, ROLE, GROUP_ID)
             VALUES ('" . self::esc($name) . "', '" . self::esc($login) . "',
                     '" . self::esc($req['admin_pass']) . "', 'admin', 0)"
        );
        $newId = (int)Info::get('dbh')->insert_id;

        // Group settings: city as display name + the requested UI language.
        Info::get('db')->exec(
            "INSERT INTO user_settings (group_id, display_name, ui_lang)
             VALUES ({$newId}, '" . self::esc(mb_substr($req['city'], 0, 255, 'UTF-8')) . "',
                     '" . self::esc($req['ui_lang']) . "')"
        );

        Info::get('db')->exec(
            "UPDATE signup_requests SET created_user_id = {$newId} WHERE id = " . (int)$req['id']
        );

        $base      = self::baseUrl();
        $plainPass = Security::decryptPassword($req['admin_pass']);
        $body = "Hello {$name},\n\n"
              . "Your Worship Songs registration has been approved.\n\n"
              . "Site: {$base}/\n"
              . "Login: {$login}\n"
              . "Password: {$plainPass}\n\n"
              . "Sign in and open Settings to create accounts for your team\n"
              . "(worship leader, musician, technician, preacher).\n\n"
              . "— Worship Songs";
        $sent = self::sendMail($req['email'], 'Worship Songs — registration approved', $body);

        self::renderResult('Заявка подтверждена',
            "Создан администратор группы «{$req['city']}».\n"
            . "Логин: {$login}\n"
            . ($sent
                ? "Письмо с данными для входа отправлено на {$req['email']}."
                : "⚠ Письмо заявителю отправить не удалось — сообщите данные вручную ({$req['email']})."));
    }

    // ══════════════════════════════════════════════════════════
    //  Helpers
    // ══════════════════════════════════════════════════════════

    private static function esc(string $s): string
    {
        return mysqli_real_escape_string(Info::get('dbh'), $s);
    }

    /** Trim + strip 4-byte UTF-8 (tables/connection are utf8, not utf8mb4). */
    private static function cleanText($s): string
    {
        $s = trim((string)$s);
        return preg_replace('/[\x{10000}-\x{10FFFF}]/u', '', $s);
    }

    private static function baseUrl(): string
    {
        $host = $_SERVER['HTTP_HOST'] ?? 'songs.winsys.lv';
        return 'https://' . $host;
    }

    /**
     * Generate a unique login from the admin name: latin/digit slug,
     * falling back to "admin", with a numeric suffix until unique.
     */
    private static function generateLogin(string $name): string
    {
        $slug = strtolower(trim(preg_replace('/[^a-zA-Z0-9]+/', '_', $name), '_'));
        if (strlen($slug) < 3) {
            $slug = 'admin';
        }
        $slug  = substr($slug, 0, 58); // leave room for the suffix within LOGIN varchar(64)
        $login = $slug;
        $i     = 1;
        while (Info::get('db')->get(
            "SELECT ID FROM users WHERE LOGIN = '" . self::esc($login) . "' LIMIT 1"
        )) {
            $i++;
            $login = $slug . $i;
        }
        return $login;
    }

    /** Plain-text UTF-8 email via PHP mail(). */
    private static function sendMail(string $to, string $subject, string $body): bool
    {
        $headers = "MIME-Version: 1.0\r\n"
                 . "Content-Type: text/plain; charset=UTF-8\r\n"
                 . "Content-Transfer-Encoding: 8bit\r\n"
                 . "From: " . self::MAIL_FROM . "\r\n";
        $encSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        return @mail($to, $encSubject, $body, $headers);
    }

    /** Minimal standalone result page (seen only by the site owner). */
    private static function renderResult(string $title, string $text): void
    {
        header('Content-Type: text/html; charset=UTF-8');
        $t = htmlspecialchars($title, ENT_QUOTES);
        $x = nl2br(htmlspecialchars($text, ENT_QUOTES));
        echo '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">'
           . '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
           . '<title>' . $t . '</title>'
           . '<style>body{background:#f0f2f5;font-family:Arial,sans-serif;display:flex;'
           . 'align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;}'
           . '.card{background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.1);'
           . 'padding:40px;max-width:480px;width:100%;}'
           . 'h1{font-size:20px;color:#2c3e50;margin:0 0 14px;}'
           . 'p{color:#5f6b7a;font-size:14px;line-height:1.6;margin:0 0 20px;}'
           . 'a{color:#3498db;text-decoration:none;font-size:14px;}</style></head>'
           . '<body><div class="card"><h1>' . $t . '</h1><p>' . $x . '</p>'
           . '<a href="/login">&larr; Worship Songs</a></div></body></html>';
    }
}
