<?php

/**
 * Observer mode Ajax methods (Aug 2026).
 *
 * The observer page (/observer) is meant for any church member: a shared
 * per-group login (role `observer`) that can search and read songs, the
 * Bible and the messages, and a passive GROUP MODE that shows whatever the
 * leader broadcasts to observers.
 *
 * OBSERVER CHANNEL — table `current_observer` (one row per group) + the
 * group-scoped WS event `observer_update`. It is completely separate from
 * `current` (the screens) and `current_notes` (the musicians): the leader
 * page and the tech console write it with their own commands
 * (observer_set_active / observer_set_song / observer_set_text) IN ADDITION
 * to their existing set_image / set_tech_image / set_text / set_leader_text
 * / set_bible_text / set_message_text / clear_image calls, and only while
 * the group's "broadcast to the group" toggle is on. The existing display
 * commands never touch this table.
 *
 * Two layers: the SONG (song_id + verse_idx, observers pick language / image
 * type themselves) and a TEXT OVERLAY (text + title — the Bible verse or
 * message paragraph the technician shows; while non-empty it is what
 * observers see, clearing it brings the song back; a song command clears it).
 *
 * The `observer_update` event carries the state without the song payload
 * ({active, song_id, verse_idx, langs, text, title}); observer pages fetch
 * the song (texts + image groups) with observer_get_state only when song_id
 * changes.
 */
trait Ajax_Observer
{
    /**
     * Commands the shared observer login may call: read-only views of songs,
     * Bible and messages plus its own channel. Everything else (display
     * commands, favorites, settings, user management) is refused for the
     * role — the login is handed out to the whole church.
     */
    private static $observerCommands = [
        'ping', 'get_user_settings', 'get_languages', 'get_all_song_lists',
        'get_songs_for_search', 'get_song_list', 'get_song_images',
        'get_bible_translations', 'get_bible_books', 'get_bible_chapters',
        'get_bible_verses', 'search_bible_verses',
        'search_messages', 'search_message_paragraphs', 'get_message',
        'observer_get_state', 'observer_list_messages',
    ];

    private static function observerCommandAllowed($command)
    {
        return in_array((string)$command, self::$observerCommands, true);
    }

    /** The leader, the technician (or the admin) drive the observer channel. */
    private static function observerCanBroadcast()
    {
        return Security::isLeader() || Security::isTech() || Security::isAdmin();
    }

    /** Normalized channel state of a group: {active, song_id, verse_idx, langs[], text, title}. */
    private static function observerState($groupId)
    {
        $row = Info::get('db')->get(
            "SELECT active, song_id, verse_idx, langs, text, title FROM current_observer WHERE groupId = " . (int)$groupId
        );
        $langs = [];
        if ($row && trim((string)$row['langs']) !== '') {
            foreach (explode(',', (string)$row['langs']) as $code) {
                $code = trim($code);
                if ($code !== '') $langs[] = $code;
            }
        }
        $on = $row && (int)$row['active'];
        return [
            'active'    => $row ? (int)$row['active'] : 0,
            'song_id'   => $on ? (int)$row['song_id'] : 0,
            'verse_idx' => $on ? (int)$row['verse_idx'] : -1,
            'langs'     => $langs,
            'text'      => $on ? (string)$row['text'] : '',
            'title'     => $on ? (string)$row['title'] : '',
        ];
    }

    private static function observerNotify($groupId, array $state)
    {
        self::broadcastToGroup((int)$groupId, ['type' => 'observer_update', 'data' => $state]);
    }

    /** Language codes from the request: letters only, lower-case, comma-joined for storage. */
    private static function observerLangsArg()
    {
        $langs = self::$args['langs'] ?? [];
        if (!is_array($langs)) $langs = [];
        $clean = [];
        foreach ($langs as $code) {
            $code = strtolower(preg_replace('/[^a-zA-Z]/', '', (string)$code));
            if ($code !== '' && !in_array($code, $clean, true)) $clean[] = $code;
        }
        return implode(',', array_slice($clean, 0, 20));
    }

    /**
     * Song row in the leader-list shape (dispName, imageName, bookName,
     * hasText_*, every TEXT* column) plus its image groups — everything an
     * observer needs to show lyrics in any language or any image type.
     */
    private static function observerSong($songId)
    {
        $songId = (int)$songId;
        if ($songId <= 0) return null;
        $hasTextFields = '';
        foreach (self::getLanguages() as $lang) {
            $col   = 'TEXT' . $lang['col_suffix'];
            $alias = 'hasText_' . $lang['code'];
            $hasTextFields .= ", (l.{$col} IS NOT NULL AND l.{$col} != '') AS {$alias}";
        }
        $song = Info::get('db')->get(
            "SELECT l.*,
                    concat(l.NUM, ' - ', l.NAME) AS dispName,
                    concat('/images/', l.LISTID, '/', l.NUM, '.jpg') AS imageName,
                    n.LIST_NAME AS bookName
                    {$hasTextFields}
             FROM song_list l
             LEFT JOIN list_names n ON n.LIST_ID = l.LISTID
             WHERE l.ID = {$songId}"
        );
        if (!$song) return null;
        $song['groups'] = SongImages::isSafeNum((string)$song['NUM']) ? self::songImageGroups($song) : [];
        return $song;
    }

    /**
     * Current observer-channel state of the caller's group. The song (with
     * texts and image groups) is included while one is broadcast.
     * Used by observer pages (enter group mode, reconnect, song change) and
     * by the leader page to restore its toggle.
     */
    private static function observer_get_state()
    {
        $groupId = (int)$_SESSION['curGroupId'];
        $state   = self::observerState($groupId);
        $state['song'] = $state['song_id'] > 0 ? self::observerSong($state['song_id']) : null;
        if ($state['song'] === null) {
            $state['song_id'] = 0;   // deleted meanwhile
        }
        return json_encode($state);
    }

    /**
     * Leader's "broadcast to the group" toggle. Args: active (0|1).
     * Turning it off also drops the broadcast song so observers fall back to
     * their waiting screen. Notifies the group either way.
     */
    private static function observer_set_active()
    {
        if (!self::observerCanBroadcast()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }
        $groupId = (int)$_SESSION['curGroupId'];
        $active  = !empty(self::$args['active']) ? 1 : 0;
        if ($active) {
            Info::get('db')->exec(
                "INSERT INTO current_observer (groupId, active) VALUES ({$groupId}, 1)
                 ON DUPLICATE KEY UPDATE active = 1"
            );
        } else {
            Info::get('db')->exec(
                "INSERT INTO current_observer (groupId, active, song_id, verse_idx, langs, text, title)
                 VALUES ({$groupId}, 0, 0, -1, '', '', '')
                 ON DUPLICATE KEY UPDATE active = 0, song_id = 0, verse_idx = -1, langs = '', text = '', title = ''"
            );
        }
        $state = self::observerState($groupId);
        self::observerNotify($groupId, $state);
        return json_encode(['status' => 'ok'] + $state);
    }

    /**
     * What the leader currently shows, for the observers.
     * Args: song_id (0 = nothing), verse_idx (-1 = whole song; otherwise the
     * verse index of the leader verse mode — same line index contract as
     * set_leader_text's chapter_indices), langs (codes the leader selected,
     * observers use them as a fallback when their own language is missing).
     * Ignored while the toggle is off (the DB row is authoritative, like the
     * NULL display target for screens).
     */
    private static function observer_set_song()
    {
        if (!self::observerCanBroadcast()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }
        $groupId = (int)$_SESSION['curGroupId'];
        $row = Info::get('db')->get("SELECT active FROM current_observer WHERE groupId = {$groupId}");
        if (!$row || !(int)$row['active']) {
            return json_encode(['status' => 'inactive']);
        }
        $songId = (int)(self::$args['song_id'] ?? 0);
        if ($songId > 0 && !Info::get('db')->get("SELECT ID FROM song_list WHERE ID = {$songId}")) {
            $songId = 0;
        }
        $verseIdx = isset(self::$args['verse_idx']) ? (int)self::$args['verse_idx'] : -1;
        if ($songId <= 0 || $verseIdx < 0) $verseIdx = -1;
        $langs = mysqli_real_escape_string(Info::get('dbh'), self::observerLangsArg());
        // A song command replaces whatever text overlay the console showed.
        Info::get('db')->exec(
            "UPDATE current_observer SET song_id = {$songId}, verse_idx = {$verseIdx}, langs = '{$langs}', text = '', title = ''
             WHERE groupId = {$groupId}"
        );
        $state = self::observerState($groupId);
        self::observerNotify($groupId, $state);
        return json_encode(['status' => 'ok'] + $state);
    }

    /**
     * Text overlay for the observers — what the tech console put on the
     * screen besides songs: a Bible verse or a message paragraph.
     * Args: text ('' = clear the overlay, the song comes back), title (the
     * Bible reference / message title). Same utf8 (3-byte) limits as the
     * screen row: 4-byte characters are stripped. Ignored while the toggle
     * is off.
     */
    private static function observer_set_text()
    {
        if (!self::observerCanBroadcast()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }
        $groupId = (int)$_SESSION['curGroupId'];
        $row = Info::get('db')->get("SELECT active FROM current_observer WHERE groupId = {$groupId}");
        if (!$row || !(int)$row['active']) {
            return json_encode(['status' => 'inactive']);
        }
        $dbh   = Info::get('dbh');
        $text  = trim((string)(self::$args['text'] ?? ''));
        $title = trim((string)(self::$args['title'] ?? ''));
        if ($text === '') {
            $title = '';
        }
        $text  = preg_replace('/[\x{10000}-\x{10FFFF}]/u', '', $text);
        $title = mb_substr(preg_replace('/[\x{10000}-\x{10FFFF}]/u', '', $title), 0, 255, 'UTF-8');
        $textEsc  = mysqli_real_escape_string($dbh, $text);
        $titleEsc = mysqli_real_escape_string($dbh, $title);
        Info::get('db')->exec(
            "UPDATE current_observer SET text = '{$textEsc}', title = '{$titleEsc}' WHERE groupId = {$groupId}"
        );
        $state = self::observerState($groupId);
        self::observerNotify($groupId, $state);
        return json_encode(['status' => 'ok'] + $state);
    }

    /**
     * Join link of the group's shared observer account, for the leader page:
     * the QR code shown to the congregation while the broadcast is on.
     * Read-only counterpart of Ajax_Settings::get_join_link — finds the
     * account itself, issues the token when the account has none yet and
     * never replaces an existing one (that stays with the admin's
     * «Новая ссылка» in the settings). Leader / tech / admin.
     * Returns {status: 'ok', token, group_name} or {status: 'none'} when the
     * group has no observer account yet.
     */
    private static function observer_join_link()
    {
        if (!self::observerCanBroadcast()) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }
        $groupId = (int)$_SESSION['curGroupId'];
        $user = Info::get('db')->get(
            "SELECT ID, JOIN_TOKEN FROM users
             WHERE ROLE = 'observer' AND (GROUP_ID = {$groupId} OR ID = {$groupId})
             ORDER BY ID LIMIT 1"
        );
        if (!$user) {
            return json_encode(['status' => 'none']);
        }
        $token = isset($user['JOIN_TOKEN']) ? (string)$user['JOIN_TOKEN'] : '';
        if (!preg_match('/^[a-f0-9]{32}$/', $token)) {
            $token = bin2hex(random_bytes(16));
            Info::get('db')->exec("UPDATE users SET JOIN_TOKEN = '{$token}' WHERE ID = " . (int)$user['ID']);
        }
        $settings  = Info::get('db')->get("SELECT display_name FROM user_settings WHERE group_id = {$groupId}");
        $groupName = $settings ? trim((string)$settings['display_name']) : '';
        if ($groupName === '') {
            $owner     = Info::get('db')->get("SELECT NAME FROM users WHERE ID = {$groupId}");
            $groupName = $owner ? (string)$owner['NAME'] : '';
        }
        return json_encode(['status' => 'ok', 'token' => $token, 'group_name' => $groupName]);
    }

    /**
     * All messages for the observer's browsable list (ID, CODE, TITLE, CITY,
     * hasText_<lang> flags); the texts come with get_message when opened.
     */
    private static function observer_list_messages()
    {
        $hasTextFields = '';
        foreach (self::getLanguages() as $lang) {
            $col   = 'TEXT' . $lang['col_suffix'];
            $alias = 'hasText_' . $lang['code'];
            $hasTextFields .= ", (m.{$col} IS NOT NULL AND m.{$col} != '') AS {$alias}";
        }
        $list = Info::get('db')->select(
            "SELECT m.ID, m.CODE, m.TITLE, m.CITY {$hasTextFields}
             FROM messages m
             ORDER BY m.TITLE, m.CODE"
        );
        return json_encode($list);
    }
}
