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
 * can't produce a working cookie and an old copied cookie dies on reuse by
 * its owner. One row per device: each login issues its own token, logout
 * revokes only the current device's one.
 *
 * Rotation is race-safe (Sept 2026): the previous hash is kept in
 * prev_validator_hash for GRACE seconds after rotated_at. Two session-less
 * requests fired at once (page + ajax poll, two restored tabs) both carry
 * the old validator; the first rotates it (atomic conditional UPDATE), the
 * second is recognised as "previous, just rotated" and logged in without
 * touching the cookie. Before this the second request treated the cookie as
 * stolen, deleted the token and cleared the cookie — the user was silently
 * logged out on the next browser start.
 *
 * Every outcome is logged via error_log (Apache error log, prefix
 * "RememberMe:") with IP, path and a short user agent, so a device that
 * "forgets" its login can be traced: either the cookie never arrived
 * (browser dropped it) or it arrived and was rejected (and why).
 *
 * The table is created / upgraded lazily on first use (per-request static
 * cache, no marker file); if that fails, remember-me is silently off and
 * normal login is unaffected.
 */
class RememberMe
{
    const COOKIE   = 'remember';
    const LIFETIME = 31536000; // 365 days, both cookie expiry and DB-side max age
    const GRACE    = 600;      // seconds a just-rotated-out validator is still accepted

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

        // The device re-logged in while still holding an older token: that row
        // is superseded by the new one — drop it instead of leaving an orphan.
        $old = self::cookieSelector();
        if ($old !== null) {
            Info::get('db')->exec("DELETE FROM auth_token WHERE selector='{$old}'");
        }

        // Lazy cleanup: tokens no device has used for over a year are dead.
        Info::get('db')->exec(
            "DELETE FROM auth_token WHERE last_used_at < DATE_SUB(NOW(), INTERVAL " . self::LIFETIME . " SECOND)");

        Info::get('db')->exec(
            "INSERT INTO auth_token (user_id, selector, validator_hash, prev_validator_hash, rotated_at, created_at, last_used_at)
             VALUES ({$userId}, '{$selector}', '{$hash}', NULL, NOW(), NOW(), NOW())");

        self::setCookie($selector . ':' . $validator, time() + self::LIFETIME);
        self::log("issued token {$selector} for user #{$userId}" . ($old !== null ? " (replaces {$old})" : ''));
    }

    /**
     * Try to log in from the cookie: on success starts the user session
     * (via Security::startUserSession) and returns true. Rotates the
     * validator. Call only when no session is active.
     */
    public static function consume()
    {
        if (empty($_COOKIE[self::COOKIE])) {
            // Diagnostic: a page request that arrived without a remember cookie
            // at all — the browser did not keep it. Only for real page loads
            // (not ajax), so "it forgot me" is traceable without log spam.
            if (self::isPageRequest()) {
                self::log('no cookie');
            }
            return false;
        }
        if (!self::schemaReady()) {
            return false;
        }
        $parts = explode(':', $_COOKIE[self::COOKIE], 2);
        if (count($parts) !== 2 || !preg_match('/^[0-9a-f]{24}$/', $parts[0])) {
            self::log('malformed cookie, cleared');
            self::clearCookie();
            return false;
        }
        $selector  = $parts[0]; // regex-validated hex, safe to interpolate
        $validator = $parts[1];
        $hash      = hash('sha256', $validator);

        $token = Info::get('db')->get(
            "SELECT *, (rotated_at IS NOT NULL AND rotated_at >= DATE_SUB(NOW(), INTERVAL " . self::GRACE . " SECOND)) AS in_grace
               FROM auth_token WHERE selector='{$selector}'");
        if (!$token) {
            self::log("unknown selector {$selector}, cookie cleared");
            self::clearCookie();
            return false;
        }

        $isCurrent  = hash_equals($token['validator_hash'], $hash);
        $isPrevious = !$isCurrent
            && !empty($token['prev_validator_hash'])
            && hash_equals($token['prev_validator_hash'], $hash)
            && (int)$token['in_grace'] === 1;

        if (!$isCurrent && !$isPrevious) {
            $why = (!empty($token['prev_validator_hash']) && hash_equals($token['prev_validator_hash'], $hash))
                ? 'previous validator outside grace window'
                : 'validator mismatch';
            self::log("{$selector} rejected ({$why}), token revoked");
            Info::get('db')->exec("DELETE FROM auth_token WHERE selector='{$selector}'");
            self::clearCookie();
            return false;
        }
        if (strtotime($token['last_used_at']) < time() - self::LIFETIME) {
            self::log("{$selector} expired, token revoked");
            Info::get('db')->exec("DELETE FROM auth_token WHERE selector='{$selector}'");
            self::clearCookie();
            return false;
        }

        $userId = (int)$token['user_id'];
        $user   = Info::get('db')->get("SELECT * FROM users WHERE ID={$userId}");
        if (!$user) {
            self::log("{$selector} user #{$userId} missing, token revoked");
            Info::get('db')->exec("DELETE FROM auth_token WHERE selector='{$selector}'");
            self::clearCookie();
            return false;
        }

        if ($isPrevious) {
            // A parallel request already rotated this token moments ago; the
            // browser is getting (or has got) the new cookie from that
            // response. Do not touch the cookie here.
            Info::get('db')->exec("UPDATE auth_token SET last_used_at=NOW() WHERE selector='{$selector}'");
            self::log("auto-login user #{$userId} via {$selector} (previous validator, parallel request)");
        } else {
            // Rotate the secret: same selector, new validator, fresh cookie.
            // Conditional on the hash we read, so of two concurrent rotations
            // only one wins; the loser leaves the cookie alone (see above).
            $newValidator = bin2hex(random_bytes(32));
            $newHash      = hash('sha256', $newValidator);
            Info::get('db')->exec(
                "UPDATE auth_token
                    SET prev_validator_hash=validator_hash, validator_hash='{$newHash}', rotated_at=NOW(), last_used_at=NOW()
                  WHERE selector='{$selector}' AND validator_hash='{$hash}'");
            if (mysqli_affected_rows(Info::get('db')->db_handle()) === 1) {
                self::setCookie($selector . ':' . $newValidator, time() + self::LIFETIME);
                self::log("auto-login user #{$userId} via {$selector} (rotated)");
            } else {
                self::log("auto-login user #{$userId} via {$selector} (rotation lost to a parallel request)");
            }
        }

        self::$consuming = true;
        Security::startUserSession($user);
        self::$consuming = false;
        return true;
    }

    /** Revoke the current device's token and drop the cookie (logout). */
    public static function forget()
    {
        $selector = self::cookieSelector();
        if ($selector !== null && self::schemaReady()) {
            Info::get('db')->exec("DELETE FROM auth_token WHERE selector='{$selector}'");
            self::log("token {$selector} revoked on logout");
        }
        self::clearCookie();
    }

    // ---- internals ----

    /** Selector from the current cookie (regex-validated), or null. */
    private static function cookieSelector()
    {
        if (empty($_COOKIE[self::COOKIE])) {
            return null;
        }
        $parts = explode(':', $_COOKIE[self::COOKIE], 2);
        return preg_match('/^[0-9a-f]{24}$/', $parts[0]) ? $parts[0] : null;
    }

    /** One line to the Apache error log with the request context. */
    private static function log($msg)
    {
        $uri = (string)($_SERVER['REQUEST_URI'] ?? '/');
        $q   = strpos($uri, '?');
        error_log(sprintf('RememberMe: %s [ip=%s %s %s%s%s ua="%s"]',
            $msg,
            $_SERVER['REMOTE_ADDR'] ?? '-',
            $_SERVER['REQUEST_METHOD'] ?? '-',
            $q === false ? $uri : substr($uri, 0, $q),
            !empty($_SERVER['HTTP_X_REQUESTED_WITH']) ? ' xhr' : '',
            !empty($_COOKIE[session_name()]) ? ' sess' : ' nosess',
            substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 90)));
    }

    /** Top-level page navigation (not ajax / fetch / asset). */
    private static function isPageRequest()
    {
        return ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET'
            && empty($_SERVER['HTTP_X_REQUESTED_WITH'])
            && strpos((string)($_SERVER['HTTP_ACCEPT'] ?? ''), 'text/html') !== false;
    }

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
     * Create the auth_token table on first use and upgrade it in place
     * (prev_validator_hash / rotated_at, Sept 2026). Database::exec swallows
     * errors, so create/alter and then verify explicitly; the result is
     * cached for the request. Runs only on login / auto-login / logout paths.
     * Manual DDL: database/migrations/add_auth_token_rotation_grace.sql.
     */
    private static function schemaReady()
    {
        static $ready = null;
        if ($ready !== null) {
            return $ready;
        }
        $db = Info::get('db');
        $db->exec(
            "CREATE TABLE IF NOT EXISTS auth_token (
                id INT NOT NULL AUTO_INCREMENT,
                user_id INT NOT NULL,
                selector CHAR(24) NOT NULL,
                validator_hash CHAR(64) NOT NULL,
                prev_validator_hash CHAR(64) NULL DEFAULT NULL,
                rotated_at DATETIME NULL DEFAULT NULL,
                created_at DATETIME NOT NULL,
                last_used_at DATETIME NOT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY uq_selector (selector),
                KEY idx_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8");
        if (!$db->get("SHOW COLUMNS FROM auth_token LIKE 'prev_validator_hash'")) {
            $db->exec(
                "ALTER TABLE auth_token
                   ADD COLUMN prev_validator_hash CHAR(64) NULL DEFAULT NULL AFTER validator_hash,
                   ADD COLUMN rotated_at DATETIME NULL DEFAULT NULL AFTER prev_validator_hash");
        }
        $ready = (bool)$db->get("SHOW COLUMNS FROM auth_token LIKE 'rotated_at'");
        if (!$ready) {
            self::log('schema not ready (auth_token missing or not upgraded), remember-me off');
        }
        return $ready;
    }
}
