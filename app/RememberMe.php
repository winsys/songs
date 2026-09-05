<?php

/**
 * Persistent "remember me" login for the home-screen icon flow (same pattern
 * as the pokupki project): after any successful login a long-lived cookie is
 * issued, and every later visit without a PHP session (browser restarted,
 * PWA opened from the installed icon) is logged in transparently from it.
 *
 * Cookie format: "<selector>:<validator>". The selector locates the row in
 * auth_token; the validator is a 256-bit random secret stored only as its
 * sha256 hash, compared in constant time. On every successful auto-login the
 * validator is rotated (new secret, same selector), so a stolen DB dump alone
 * can't produce a working cookie and an old copied cookie dies on first reuse
 * by its owner. One row per device: each login issues its own token, logout
 * revokes only the current device's one.
 *
 * The table is created lazily on first use (per-request static cache, no
 * marker file); if creation fails, remember-me is silently off and normal
 * login is unaffected.
 */
class RememberMe
{
    const COOKIE   = 'remember';
    const LIFETIME = 31536000; // 365 days, both cookie expiry and DB-side max age

    /** True while consume() is starting the session — suppresses the extra
     *  issue() from Security::startUserSession (the cookie was just rotated). */
    private static $consuming = false;

    /** Issue a fresh token for this device and set the cookie. */
    public static function issue($userId)
    {
        if (self::$consuming || !self::schemaReady()) {
            return;
        }
        $userId    = (int)$userId;
        $selector  = bin2hex(random_bytes(12));   // 24 chars, indexed lookup key
        $validator = bin2hex(random_bytes(32));   // 64 chars, the actual secret
        $hash      = hash('sha256', $validator);

        // Lazy cleanup: tokens no device has used for over a year are dead.
        Info::get('db')->exec(
            "DELETE FROM auth_token WHERE last_used_at < DATE_SUB(NOW(), INTERVAL " . self::LIFETIME . " SECOND)");

        Info::get('db')->exec(
            "INSERT INTO auth_token (user_id, selector, validator_hash, created_at, last_used_at)
             VALUES ({$userId}, '{$selector}', '{$hash}', NOW(), NOW())");

        self::setCookie($selector . ':' . $validator, time() + self::LIFETIME);
    }

    /**
     * Try to log in from the cookie: on success starts the user session
     * (via Security::startUserSession) and returns true. Rotates the
     * validator. Call only when no session is active.
     */
    public static function consume()
    {
        if (empty($_COOKIE[self::COOKIE]) || !self::schemaReady()) {
            return false;
        }
        $parts = explode(':', $_COOKIE[self::COOKIE], 2);
        if (count($parts) !== 2 || !preg_match('/^[0-9a-f]{24}$/', $parts[0])) {
            self::clearCookie();
            return false;
        }
        $selector  = $parts[0]; // regex-validated hex, safe to interpolate
        $validator = $parts[1];

        $token = Info::get('db')->get(
            "SELECT * FROM auth_token WHERE selector='{$selector}'");
        if (!$token
            || !hash_equals($token['validator_hash'], hash('sha256', $validator))
            || strtotime($token['last_used_at']) < time() - self::LIFETIME) {
            if ($token) {
                Info::get('db')->exec("DELETE FROM auth_token WHERE selector='{$selector}'");
            }
            self::clearCookie();
            return false;
        }

        $user = Info::get('db')->get(
            "SELECT * FROM users WHERE ID=" . (int)$token['user_id']);
        if (!$user) {
            Info::get('db')->exec("DELETE FROM auth_token WHERE selector='{$selector}'");
            self::clearCookie();
            return false;
        }

        // Rotate the secret: same selector, new validator, fresh cookie.
        $newValidator = bin2hex(random_bytes(32));
        $newHash      = hash('sha256', $newValidator);
        Info::get('db')->exec(
            "UPDATE auth_token SET validator_hash='{$newHash}', last_used_at=NOW() WHERE selector='{$selector}'");
        self::setCookie($selector . ':' . $newValidator, time() + self::LIFETIME);

        self::$consuming = true;
        Security::startUserSession($user);
        self::$consuming = false;
        return true;
    }

    /** Revoke the current device's token and drop the cookie (logout). */
    public static function forget()
    {
        if (!empty($_COOKIE[self::COOKIE])) {
            $parts = explode(':', $_COOKIE[self::COOKIE], 2);
            if (preg_match('/^[0-9a-f]{24}$/', $parts[0]) && self::schemaReady()) {
                Info::get('db')->exec("DELETE FROM auth_token WHERE selector='{$parts[0]}'");
            }
        }
        self::clearCookie();
    }

    // ---- internals ----

    /**
     * Set-Cookie via header(): PHP 7.2's setcookie() has no SameSite option
     * (array signature is 7.3+). Secure flag only on HTTPS so a local
     * test server still works.
     */
    private static function setCookie($value, $expires)
    {
        $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? '; Secure' : '';
        header('Set-Cookie: ' . self::COOKIE . '=' . $value
            . '; Expires=' . gmdate('D, d M Y H:i:s T', $expires)
            . '; Max-Age=' . max(0, $expires - time())
            . '; Path=/; HttpOnly; SameSite=Lax' . $secure, false);
    }

    private static function clearCookie()
    {
        self::setCookie('', time() - 86400);
    }

    /**
     * Create the auth_token table on first use. Database::exec swallows
     * errors, so create and then verify explicitly; the result is cached
     * for the request. Runs only on login / auto-login / logout paths.
     */
    private static function schemaReady()
    {
        static $ready = null;
        if ($ready !== null) {
            return $ready;
        }
        Info::get('db')->exec(
            "CREATE TABLE IF NOT EXISTS auth_token (
                id INT NOT NULL AUTO_INCREMENT,
                user_id INT NOT NULL,
                selector CHAR(24) NOT NULL,
                validator_hash CHAR(64) NOT NULL,
                created_at DATETIME NOT NULL,
                last_used_at DATETIME NOT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY uq_selector (selector),
                KEY idx_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8");
        $ready = (bool)Info::get('db')->get("SHOW TABLES LIKE 'auth_token'");
        return $ready;
    }
}
