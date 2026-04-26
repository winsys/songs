<?php

/**
 * T — UI translation helper for server-rendered pages (login, GoogleAuth pages, layout.html).
 *
 * Reads the same JSON dictionaries as the JS-side window.t().
 * Language resolved from $_SESSION['ui_lang'], defaulting to 'ru'.
 *
 * Usage:
 *   echo T::s('login.title');
 *   echo T::s('confirm.delete', ['name' => $songName]);
 *   echo T::dictJson();   // for embedding into <script>window.UI_DICT = ...</script>
 *
 * Missing keys return the key itself (mirrors JS behaviour).
 */
class T
{
    /** @var string[] */
    private const ALLOWED = ['ru', 'de', 'en'];

    /** @var string|null  Resolved language for the current request. */
    private static $lang = null;

    /** @var array|null   Lazily loaded dictionary for self::$lang. */
    private static $dict = null;

    /** Returns the active UI language code (always one of ALLOWED). */
    public static function lang(): string
    {
        if (self::$lang !== null) {
            return self::$lang;
        }
        $l = isset($_SESSION['ui_lang']) ? (string)$_SESSION['ui_lang'] : 'ru';
        if (!in_array($l, self::ALLOWED, true)) {
            $l = 'ru';
        }
        self::$lang = $l;
        return $l;
    }

    /** Force a specific language for this request (used by the login page). */
    public static function setLang(string $lang): void
    {
        if (!in_array($lang, self::ALLOWED, true)) {
            $lang = 'ru';
        }
        self::$lang = $lang;
        self::$dict = null;
    }

    /** Translate a key, optionally substituting {name} placeholders from $params. */
    public static function s(string $key, array $params = []): string
    {
        $dict = self::dict();
        $s = isset($dict[$key]) ? (string)$dict[$key] : $key;
        if (!empty($params)) {
            foreach ($params as $k => $v) {
                $s = str_replace('{' . $k . '}', (string)$v, $s);
            }
        }
        return $s;
    }

    /** Returns the current dictionary as JSON, ready to embed in a <script> tag. */
    public static function dictJson(): string
    {
        return json_encode(self::dict(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /** Loads (and caches) the JSON dictionary for the active language. */
    private static function dict(): array
    {
        if (self::$dict !== null) {
            return self::$dict;
        }
        $path = __DIR__ . '/../public/js/i18n/' . self::lang() . '.json';
        if (is_readable($path)) {
            $raw = file_get_contents($path);
            $data = json_decode($raw, true);
            self::$dict = is_array($data) ? $data : [];
        } else {
            self::$dict = [];
        }
        return self::$dict;
    }
}
