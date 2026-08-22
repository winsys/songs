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
 * page writes it with its own commands (observer_set_active /
 * observer_set_song) IN ADDITION to its existing set_image / set_leader_text
 * / clear_image calls, and only while the leader's "broadcast to the group"
 * toggle is on. The existing display commands never touch this table.
 *
 * The `observer_update` event carries the compact state
 * ({active, song_id, verse_idx, langs}); observer pages fetch the full song
 * (texts + image groups) with observer_get_state only when song_id changes.
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

    /** Only the leader (or the admin) drives the observer channel. */
    private static function observerCanBroadcast()
    {
        return Security::isLeader() || Security::isAdmin();
    }

    /** Normalized channel state of a group: {active, song_id, verse_idx, langs[]}. */
    private static function observerState($groupId)
    {
        $row = Info::get('db')->get(
            "SELECT active, song_id, verse_idx, langs FROM current_observer WHERE groupId = " . (int)$groupId
        );
        $langs = [];
        if ($row && trim((string)$row['langs']) !== '') {
            foreach (explode(',', (string)$row['langs']) as $code) {
                $code = trim($code);
                if ($code !== '') $langs[] = $code;
            }
        }
        return [
            'active'    => $row ? (int)$row['active'] : 0,
            'song_id'   => ($row && (int)$row['active']) ? (int)$row['song_id'] : 0,
            'verse_idx' => ($row && (int)$row['active']) ? (int)$row['verse_idx'] : -1,
            'langs'     => $langs,
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
                "INSERT INTO current_observer (groupId, active, song_id, verse_idx, langs)
                 VALUES ({$groupId}, 0, 0, -1, '')
                 ON DUPLICATE KEY UPDATE active = 0, song_id = 0, verse_idx = -1, langs = ''"
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
        Info::get('db')->exec(
            "UPDATE current_observer SET song_id = {$songId}, verse_idx = {$verseIdx}, langs = '{$langs}'
             WHERE groupId = {$groupId}"
        );
        $state = self::observerState($groupId);
        self::observerNotify($groupId, $state);
        return json_encode(['status' => 'ok'] + $state);
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
