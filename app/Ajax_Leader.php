<?php

/**
 * Leader page specific Ajax functions (verse broadcast mode).
 */
trait Ajax_Leader
{
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
}
