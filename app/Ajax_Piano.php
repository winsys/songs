<?php

/**
 * Pianist mode Ajax methods (Aug 2026).
 *
 * The pianist page (/piano) is a private copy of the leader page: the user
 * searches the allowed song collections, keeps a personal list of songs and
 * opens their sheet music / lyrics on his OWN screen only. Nothing here
 * touches the screens, the notes channel, favorites of the group or any
 * other shared state — the list lives in the PHP session
 * ($_SESSION['piano_favorites'], an ordered array of song IDs) and disappears
 * with the logout. Available to the roles musician, leader, tech and admin
 * (route access in Security::$roleRoutes).
 */
trait Ajax_Piano
{
    /** Song IDs of the session's pianist list, in order. */
    private static function pianoIds()
    {
        $ids = isset($_SESSION['piano_favorites']) && is_array($_SESSION['piano_favorites'])
            ? $_SESSION['piano_favorites'] : [];
        $out = [];
        foreach ($ids as $id) {
            $id = (int)$id;
            if ($id > 0 && !in_array($id, $out, true)) {
                $out[] = $id;
            }
        }
        return $out;
    }

    private static function pianoSave(array $ids)
    {
        $_SESSION['piano_favorites'] = array_values($ids);
    }

    /**
     * Collections the group may use (user_settings.available_lists); [] = no
     * restriction — the same rule the song-list selector follows.
     */
    private static function pianoAllowedLists()
    {
        $groupId = (int)$_SESSION['curGroupId'];
        $row = Info::get('db')->get("SELECT available_lists FROM user_settings WHERE group_id = {$groupId}");
        if (!$row || trim((string)$row['available_lists']) === '') {
            return [];
        }
        $out = [];
        foreach (explode(',', (string)$row['available_lists']) as $id) {
            $id = (int)trim($id);
            if ($id > 0) {
                $out[] = $id;
            }
        }
        return $out;
    }

    /**
     * The session's song list in the leader's favorites row format
     * (dispName, imageName, bookName, hasText_*; FID = SONGID = song ID).
     * Songs deleted meanwhile are dropped from the session silently.
     */
    private static function piano_get_favorites()
    {
        $ids = self::pianoIds();
        if (!$ids) {
            return json_encode([]);
        }
        $hasTextFields = '';
        foreach (self::getLanguages() as $lang) {
            $col   = 'TEXT' . $lang['col_suffix'];
            $alias = 'hasText_' . $lang['code'];
            $hasTextFields .= ", (l.{$col} IS NOT NULL AND l.{$col} != '') AS {$alias}";
        }
        $rows = Info::get('db')->select(
            "SELECT l.*,
                    l.ID AS FID,
                    l.ID AS SONGID,
                    concat(l.NUM, ' - ', l.NAME) AS dispName,
                    concat('/images/', l.LISTID, '/', l.NUM, '.jpg') AS imageName,
                    n.LIST_NAME AS bookName
                    {$hasTextFields}
             FROM song_list l
             LEFT JOIN list_names n ON n.LIST_ID = l.LISTID
             WHERE l.ID IN (" . implode(',', $ids) . ")"
        );
        $byId = [];
        foreach ($rows as $r) {
            $byId[(int)$r['ID']] = $r;
        }
        $out  = [];
        $keep = [];
        foreach ($ids as $id) {
            if (isset($byId[$id])) {
                $out[]  = $byId[$id];
                $keep[] = $id;
            }
        }
        if (count($keep) !== count($ids)) {
            self::pianoSave($keep);
        }
        return json_encode($out);
    }

    /** Add a song (from an allowed collection) to the end of the session list. Params: id */
    private static function piano_add_favorite()
    {
        $id   = (int)(self::$args['id'] ?? 0);
        $song = $id > 0 ? Info::get('db')->get("SELECT ID, LISTID FROM song_list WHERE ID = {$id}") : null;
        if (!$song) {
            return json_encode(['status' => 'error', 'message' => 'Song not found']);
        }
        $allowed = self::pianoAllowedLists();
        if ($allowed && !in_array((int)$song['LISTID'], $allowed, true)) {
            return json_encode(['status' => 'error', 'message' => T::s('ajax.error.noCollection')]);
        }
        $ids = self::pianoIds();
        if (!in_array($id, $ids, true)) {
            $ids[] = $id;
            self::pianoSave($ids);
        }
        return json_encode(['status' => 'success']);
    }

    /** Remove a song from the session list. Params: id */
    private static function piano_delete_favorite()
    {
        $id  = (int)(self::$args['id'] ?? 0);
        $ids = array_values(array_filter(self::pianoIds(), function ($x) use ($id) { return $x !== $id; }));
        self::pianoSave($ids);
        return json_encode(['status' => 'success']);
    }

    private static function piano_clear_favorites()
    {
        self::pianoSave([]);
        return json_encode(['status' => 'success']);
    }
}
