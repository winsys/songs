<?php

/**
 * Leader page specific Ajax functions (verse broadcast mode).
 */
trait Ajax_Leader
{
    /**
     * «Сообщение музыкантам» (Sept 2026): a short text the leader sends to
     * the musician pages of the OWN group. Transient — a group-routed WS
     * event `musician_message` {text, id, style}, nothing stored; the
     * musician page slides it in over the notes for a few seconds, leader
     * pages show "message on screen" meanwhile. The style (colours,
     * transparency, height, font, max font size) comes from the group's
     * settings at send time, so open musician pages need no reload.
     *
     * Args: text (at most 300 characters).
     */
    private static function send_musician_message()
    {
        if (!in_array(Security::getRole(), ['leader', 'tech', 'admin'], true)) {
            return json_encode(['status' => 'error', 'message' => 'Access denied']);
        }
        $text = trim(str_replace("\r\n", "\n", (string)(self::$args['text'] ?? '')));
        if (function_exists('mb_substr')) {
            $text = mb_substr($text, 0, 300, 'UTF-8');
        }
        if ($text === '') {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.messageEmpty')]);
        }
        $groupId = (int)$_SESSION['curGroupId'];
        self::broadcastToGroup($groupId, [
            'type' => 'musician_message',
            'data' => [
                'text'  => $text,
                'id'    => bin2hex(random_bytes(4)),
                'style' => self::loadMusicianMsgStyle($groupId),
            ],
        ]);
        return json_encode(['status' => 'success']);
    }

    /**
     * Verse broadcast from the leader's split-screen verse mode.
     *
     * Same UPSERT semantics as Ajax_Tech::set_text (update the row keyed by
     * image_name; a non-empty text replaces whatever occupies the screen row),
     * but the write goes to the technician-set LEADER-channel display target:
     * the request carries channel:'leader', resolveDisplayTarget() reads
     * user_settings.leader_display_target and NULL means "do not broadcast" —
     * no screen is touched. Notes channel is never involved here (the song
     * was already opened via set_image, which handles notes).
     *
     * Args: image_name (song sheet path — the UPSERT key), text, song_name,
     * chapter_indices (verse indices into the default-language split, same
     * contract the tech console restores its highlight from).
     */
    private static function set_leader_text()
    {
        $dbh    = Info::get('dbh');
        $userId = (int)$_SESSION['curGroupId'];

        $targetGroupId = self::resolveDisplayTarget($userId);
        if ($targetGroupId === null) {
            return ''; // broadcast disabled for this channel — leave screens alone
        }

        $text       = mysqli_real_escape_string($dbh, self::$args['text']       ?? '');
        $image_name = mysqli_real_escape_string($dbh, self::$args['image_name'] ?? '');
        $song_name  = mysqli_real_escape_string($dbh, self::$args['song_name']  ?? '');
        $chapter_indices = mysqli_real_escape_string($dbh, self::$args['chapter_indices'] ?? '');

        $row = Info::get('db')->get(
            "SELECT groupId FROM current WHERE groupId={$targetGroupId} AND image='{$image_name}'"
        );
        if ($row) {
            Info::get('db')->exec(
                "UPDATE current
                 SET text='{$text}', song_name='{$song_name}', chapter_indices='{$chapter_indices}'
                 WHERE groupId={$targetGroupId} AND image='{$image_name}'"
            );
        } elseif ($text !== '') {
            // The target screen may hold unrelated content (media, another
            // group's row shape) — a verse click must still reach it, so
            // replace the row. Empty text (verse toggle-off) stays a silent
            // no-op to avoid resurrecting a stale song image.
            Info::get('db')->exec("DELETE FROM current WHERE groupId={$targetGroupId}");
            Info::get('db')->exec(
                "INSERT INTO current (groupId, image, text, song_name, chapter_indices, video_src, video_state)
                 VALUES ({$targetGroupId}, '{$image_name}', '{$text}', '{$song_name}', '{$chapter_indices}', '', 'stopped')"
            );
        }
        self::updateSocket($targetGroupId);
        return '';
    }

    /**
     * Language selection made in the leader's verse mode. Pure console-follow
     * side channel (like leader_song_changed): broadcast to the caller's OWN
     * group so tech consoles mirror their language toggles — regardless of
     * where (or whether) the screen broadcast goes. No DB write.
     *
     * Args: langs — array of language codes in group order, e.g. ['de','en'].
     */
    private static function set_leader_langs()
    {
        self::broadcastConsoleLangs('leader_langs_changed');
        return '';
    }

    /**
     * The mirror image of set_leader_langs: the tech console's song-mode
     * language toggles, broadcast as `tech_langs_changed` so the leader's
     * verse mode follows them. Same args, same no-DB side channel.
     */
    private static function set_tech_langs()
    {
        self::broadcastConsoleLangs('tech_langs_changed');
        return '';
    }

    /** Broadcast the caller's language selection to the own group as $type. */
    private static function broadcastConsoleLangs($type)
    {
        $userId = (int)$_SESSION['curGroupId'];
        $langs  = self::$args['langs'] ?? [];
        if (!is_array($langs)) $langs = [];
        $clean = [];
        foreach ($langs as $code) {
            $code = strtolower(preg_replace('/[^a-zA-Z]/', '', (string)$code));
            if ($code !== '') $clean[] = $code;
        }
        if (!empty($clean)) {
            self::broadcastToGroup($userId, [
                'type' => $type,
                'data' => ['langs' => $clean],
            ]);
        }
    }
}
