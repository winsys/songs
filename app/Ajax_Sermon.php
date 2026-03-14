<?php

/**
 * Sermon page Ajax methods
 * Handles sermon CRUD operations, uploads, and settings
 */
trait Ajax_Sermon
{
    private static function get_sermon_list()
    {
        $userId = (int)$_SESSION['userId'];
        $list = Info::get('db')->select(
            "SELECT ID, TITLE, SERMON_DATE, UPDATED_AT
             FROM sermons
             WHERE USER_ID = {$userId}
             ORDER BY SERMON_DATE DESC, UPDATED_AT DESC"
        );
        return json_encode($list);
    }

    private static function get_sermon()
    {
        $userId   = (int)$_SESSION['userId'];
        $sermonId = (int)self::$args['id'];
        $list = Info::get('db')->select(
            "SELECT ID, TITLE, SERMON_DATE, CONTENT
             FROM sermons
             WHERE ID = {$sermonId} AND USER_ID = {$userId}
             LIMIT 1"
        );
        return json_encode(count($list) > 0 ? $list[0] : null);
    }

    private static function save_sermon()
    {
        $userId = (int)$_SESSION['userId'];
        $dbh    = Info::get('dbh');

        $sermonId = isset(self::$args['id']) ? (int)self::$args['id'] : 0;
        $title    = isset(self::$args['title'])   ? mysqli_real_escape_string($dbh, self::$args['title'])   : '';
        $date     = isset(self::$args['date'])    ? mysqli_real_escape_string($dbh, self::$args['date'])    : '';
        $content  = isset(self::$args['content']) ? mysqli_real_escape_string($dbh, self::$args['content']) : '';

        $dateVal = ($date !== '') ? "'{$date}'" : 'NULL';

        if ($sermonId > 0) {
            $existing = Info::get('db')->select(
                "SELECT ID FROM sermons WHERE ID = {$sermonId} AND USER_ID = {$userId} LIMIT 1"
            );
            if (count($existing) > 0) {
                $dbh->query(
                    "UPDATE sermons
                     SET TITLE = '{$title}', SERMON_DATE = {$dateVal}, CONTENT = '{$content}'
                     WHERE ID = {$sermonId} AND USER_ID = {$userId}"
                );
                $err = $dbh->error;
                if ($err) {
                    error_log("save_sermon UPDATE error: " . $err);
                    return json_encode(array('status' => 'error', 'message' => $err));
                }
                return json_encode(array('id' => $sermonId, 'status' => 'ok'));
            }
        }

        $dbh->query(
            "INSERT INTO sermons (USER_ID, TITLE, SERMON_DATE, CONTENT)
             VALUES ({$userId}, '{$title}', {$dateVal}, '{$content}')"
        );
        $err = $dbh->error;
        if ($err) {
            error_log("save_sermon INSERT error: " . $err);
            return json_encode(array('status' => 'error', 'message' => $err));
        }
        $newId = $dbh->insert_id;
        return json_encode(array('id' => $newId, 'status' => 'ok'));
    }

    private static function delete_sermon()
    {
        $userId   = (int)$_SESSION['userId'];
        $sermonId = (int)self::$args['id'];
        Info::get('db')->exec(
            "DELETE FROM sermons WHERE ID = {$sermonId} AND USER_ID = {$userId}"
        );
        return json_encode(array('status' => 'ok'));
    }

    private static function upload_sermon_image()
    {
        $userId = (int)$_SESSION['userId'];

        if (!isset($_FILES['image'])) {
            return json_encode(['status' => 'error', 'message' => 'No file in $_FILES["image"]']);
        }
        if ($_FILES['image']['error'] !== UPLOAD_ERR_OK) {
            $codes = [1=>'File too large (php.ini)',2=>'File too large (form)',
                3=>'Partial upload',4=>'No file uploaded',6=>'No tmp dir',
                7=>'Cannot write to disk',8=>'Blocked by extension'];
            $code = $_FILES['image']['error'];
            return json_encode(['status' => 'error', 'message' => $codes[$code] ?? 'Error ' . $code]);
        }

        // [SECURITY #5] Проверка расширения
        $ext         = strtolower(pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION));
        $allowedExt  = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        if (!in_array($ext, $allowedExt, true)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid file type: ' . $ext]);
        }

        // [SECURITY #5] Проверка реального MIME-типа
        $allowedMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!self::checkMime($_FILES['image']['tmp_name'], $allowedMime)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid file type (MIME mismatch)']);
        }

        $uploadDir = __DIR__ . '/../public/sermon_images/' . $userId . '/';
        if (!file_exists($uploadDir) && !mkdir($uploadDir, 0755, true)) {
            return json_encode(['status' => 'error', 'message' => 'Cannot create dir']);
        }

        $filename   = uniqid('img_', true) . '.' . $ext;
        $targetFile = $uploadDir . $filename;

        if (move_uploaded_file($_FILES['image']['tmp_name'], $targetFile)) {
            return json_encode(['status' => 'success',
                'path' => '/sermon_images/' . $userId . '/' . $filename]);
        }
        return json_encode(['status' => 'error', 'message' => 'move_uploaded_file failed']);
    }

    /**
     * Загрузить видеофайл для проповеди.
     * Input: multipart file 'video'
     * Output: { status, path, name }
     */
    private static function upload_sermon_video()
    {
        $userId = (int)$_SESSION['userId'];

        if (!isset($_FILES['video']) || $_FILES['video']['error'] !== UPLOAD_ERR_OK) {
            $code = isset($_FILES['video']) ? $_FILES['video']['error'] : -1;
            return json_encode(['status' => 'error', 'message' => 'Upload error code: ' . $code]);
        }

        // [SECURITY #5] Проверка расширения
        $ext         = strtolower(pathinfo($_FILES['video']['name'], PATHINFO_EXTENSION));
        $allowedExt  = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'];
        if (!in_array($ext, $allowedExt, true)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid video type: ' . $ext]);
        }

        // [SECURITY #5] Проверка реального MIME-типа
        $allowedMime = [
            'video/mp4', 'video/webm', 'video/ogg',
            'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
            'application/octet-stream', // некоторые .mkv/.mov
        ];
        if (!self::checkMime($_FILES['video']['tmp_name'], $allowedMime)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid file type (MIME mismatch)']);
        }

        $uploadDir = __DIR__ . '/../public/sermon_videos/' . $userId . '/';
        if (!file_exists($uploadDir) && !mkdir($uploadDir, 0755, true)) {
            return json_encode(['status' => 'error', 'message' => 'Cannot create upload dir']);
        }

        $filename   = uniqid('vid_', true) . '.' . $ext;
        $targetFile = $uploadDir . $filename;

        if (!move_uploaded_file($_FILES['video']['tmp_name'], $targetFile)) {
            return json_encode(['status' => 'error', 'message' => 'move_uploaded_file failed']);
        }

        return json_encode([
            'status' => 'success',
            'path'   => '/sermon_videos/' . $userId . '/' . $filename,
            'name'   => $_FILES['video']['name'],
        ]);
    }

    private static function save_sermon_notes_settings()
    {
        $userId   = (int)$_SESSION['userId'];
        $fontSize = isset(self::$args['sermon_notes_font_size']) ? intval(self::$args['sermon_notes_font_size']) : 13;
        $scale    = isset(self::$args['sermon_scale_chips'])     ? intval(self::$args['sermon_scale_chips'])     : 0;

        $existing = Info::get('db')->get("SELECT user_id FROM user_settings WHERE user_id = {$userId}");
        if ($existing) {
            Info::get('db')->exec("
            UPDATE user_settings
            SET sermon_notes_font_size = {$fontSize},
                sermon_scale_chips     = {$scale}
            WHERE user_id = {$userId}
        ");
        }
        return json_encode(['status' => 'success']);
    }

    /**
     * Удалить медиафайл проповеди (изображение или видео).
     * Params: path (относительный путь типа /sermon_images/123/img_abc.jpg)
     */
    private static function delete_sermon_media()
    {
        $userId = (int)$_SESSION['userId'];
        $path   = isset(self::$args['path']) ? self::$args['path'] : '';

        if (empty($path)) {
            return json_encode(['status' => 'error', 'message' => 'Empty path']);
        }

        // Проверяем, что путь относится к разрешённым директориям пользователя
        $allowedPrefixes = [
            '/sermon_images/' . $userId . '/',
            '/sermon_videos/' . $userId . '/'
        ];

        $isAllowed = false;
        foreach ($allowedPrefixes as $prefix) {
            if (strpos($path, $prefix) === 0) {
                $isAllowed = true;
                break;
            }
        }

        if (!$isAllowed) {
            return json_encode(['status' => 'error', 'message' => 'Invalid path']);
        }

        // Формируем полный путь к файлу
        $filePath = __DIR__ . '/../public' . $path;

        // Удаляем файл, если он существует
        if (file_exists($filePath)) {
            unlink($filePath);
        }

        return json_encode(['status' => 'ok']);
    }

    /**
     * Get list of groups where user can display sermons.
     * Returns own group + groups that approved access.
     */
    private static function get_display_targets()
    {
        $userId = (int)$_SESSION['userId'];

        // Own group (userId in session is actually the GROUP_ID)
        $ownGroup = Info::get('db')->get(
            "SELECT us.user_id, us.display_name
             FROM user_settings us
             JOIN users u ON u.ID = us.user_id
             WHERE u.GROUP_ID = {$userId}
             LIMIT 1"
        );

        $targets = [];
        if ($ownGroup) {
            $targets[] = [
                'group_id' => $userId,
                'display_name' => $ownGroup['display_name'] ?: 'Мой дисплей',
                'is_own' => true
            ];
        }

        // Groups that approved access
        $approved = Info::get('db')->select(
            "SELECT dar.target_group_id, us.display_name FROM display_access_requests dar
                LEFT JOIN user_settings us ON us.user_id = dar.target_group_id
                WHERE dar.requester_group_id = {$userId} AND dar.status = 'approved'"
        );

        foreach ($approved as $row) {
            $targets[] = [
                'group_id' => (int)$row['target_group_id'],
                'display_name' => $row['display_name'] ?: 'Группа #' . $row['target_group_id'],
                'is_own' => false
            ];
        }

        return json_encode(['status' => 'ok', 'targets' => $targets]);
    }

    /**
     * Get list of groups available to request access.
     * Returns groups that haven't been requested yet or were rejected.
     */
    private static function get_available_groups()
    {
        $userId = (int)$_SESSION['userId'];

        // Get all groups except own
        $allGroups = Info::get('db')->select(
            "SELECT DISTINCT u.GROUP_ID as group_id, us.display_name FROM users u
                LEFT JOIN user_settings us ON us.user_id = u.GROUP_ID
                LEFT JOIN display_access_requests da ON da.requester_group_id = {$userId} AND da.target_group_id <> u.GROUP_ID
                WHERE u.GROUP_ID != {$userId} AND u.GROUP_ID > 0 AND NOT (us.display_name IS NULL)"
        );

        // Get pending/approved requests
        $requests = Info::get('db')->select(
            "SELECT target_group_id, status
             FROM display_access_requests
             WHERE requester_group_id = {$userId} AND status IN ('pending', 'approved')"
        );

        $requestedGroups = [];
        foreach ($requests as $req) {
            $requestedGroups[(int)$req['target_group_id']] = $req['status'];
        }

        $available = [];
        foreach ($allGroups as $group) {
            $gid = (int)$group['group_id'];
            if (!isset($requestedGroups[$gid])) {
                $available[] = [
                    'group_id' => $gid,
                    'display_name' => $group['display_name'] ?: 'Группа #' . $gid
                ];
            }
        }

        return json_encode(['status' => 'ok', 'groups' => $available]);
    }

    /**
     * Send access request to a group.
     */
    private static function request_display_access()
    {
        $userId        = (int)$_SESSION['userId'];
        $targetGroupId = isset(self::$args['target_group_id']) ? (int)self::$args['target_group_id'] : 0;

        if ($targetGroupId <= 0 || $targetGroupId === $userId) {
            return json_encode(['status' => 'error', 'message' => 'Invalid target group']);
        }

        // Get requester's display name
        $requester = Info::get('db')->get(
            "SELECT us.display_name
             FROM users u
             LEFT JOIN user_settings us ON us.user_id = u.ID
             WHERE u.GROUP_ID = {$userId}
             LIMIT 1"
        );
        $requesterName = $requester ? ($requester['display_name'] ?: 'Группа #' . $userId) : 'Группа #' . $userId;

        // Check if request already exists
        $existing = Info::get('db')->get(
            "SELECT id, status FROM display_access_requests
             WHERE requester_group_id = {$userId} AND target_group_id = {$targetGroupId}"
        );

        $requestId = null;
        if ($existing) {
            if ($existing['status'] === 'rejected') {
                // Update rejected request to pending
                Info::get('db')->exec(
                    "UPDATE display_access_requests
                     SET status = 'pending', requested_at = NOW(), responded_at = NULL
                     WHERE id = {$existing['id']}"
                );
                $requestId = (int)$existing['id'];
            } else {
                return json_encode(['status' => 'error', 'message' => 'Request already exists']);
            }
        } else {
            // Create new request
            Info::get('db')->exec(
                "INSERT INTO display_access_requests (requester_group_id, target_group_id, status)
                 VALUES ({$userId}, {$targetGroupId}, 'pending')"
            );
            $requestId = Info::get('dbh')->insert_id;
        }

        // Broadcast WebSocket notification to target group
        self::broadcastToGroup($targetGroupId, [
            'type' => 'access_request',
            'data' => [
                'id' => $requestId,
                'requester_group_id' => $userId,
                'requester_name' => $requesterName,
                'requested_at' => date('Y-m-d H:i:s')
            ]
        ]);

        return json_encode(['status' => 'ok']);
    }

    /**
     * Get pending access requests for current group (to be shown on Tech page).
     */
    private static function get_pending_access_requests()
    {
        $userId = (int)$_SESSION['userId'];

        $requests = Info::get('db')->select(
            "SELECT dar.id, dar.requester_group_id, dar.requested_at,
                    (SELECT us.display_name
                     FROM users u
                     LEFT JOIN user_settings us ON us.user_id = u.ID
                     WHERE u.GROUP_ID = dar.requester_group_id
                     LIMIT 1) as display_name
             FROM display_access_requests dar
             WHERE dar.target_group_id = {$userId} AND dar.status = 'pending'
             ORDER BY dar.requested_at DESC"
        );

        $result = [];
        foreach ($requests as $req) {
            $result[] = [
                'id' => (int)$req['id'],
                'requester_group_id' => (int)$req['requester_group_id'],
                'requester_name' => $req['display_name'] ?: 'Группа #' . $req['requester_group_id'],
                'requested_at' => $req['requested_at']
            ];
        }

        return json_encode(['status' => 'ok', 'requests' => $result]);
    }

    /**
     * Approve or reject access request.
     */
    private static function respond_to_access_request()
    {
        $userId    = (int)$_SESSION['userId'];
        $requestId = isset(self::$args['request_id']) ? (int)self::$args['request_id'] : 0;
        $action    = isset(self::$args['action']) ? self::$args['action'] : '';

        if (!in_array($action, ['approve', 'reject'])) {
            return json_encode(['status' => 'error', 'message' => 'Invalid action']);
        }

        // Verify this request is for current group and get requester info
        $request = Info::get('db')->get(
            "SELECT dar.id, dar.requester_group_id, us.display_name as target_name
             FROM display_access_requests dar
             LEFT JOIN users u ON u.GROUP_ID = dar.target_group_id
             LEFT JOIN user_settings us ON us.user_id = u.ID
             WHERE dar.id = {$requestId} AND dar.target_group_id = {$userId} AND dar.status = 'pending'
             LIMIT 1"
        );

        if (!$request) {
            return json_encode(['status' => 'error', 'message' => 'Request not found']);
        }

        $newStatus = ($action === 'approve') ? 'approved' : 'rejected';
        Info::get('db')->exec(
            "UPDATE display_access_requests
             SET status = '{$newStatus}', responded_at = NOW()
             WHERE id = {$requestId}"
        );

        // Broadcast response to requester group
        $targetName = $request['target_name'] ?: 'Группа #' . $userId;
        self::broadcastToGroup((int)$request['requester_group_id'], [
            'type' => 'access_response',
            'data' => [
                'target_group_id' => $userId,
                'target_name' => $targetName,
                'status' => $newStatus
            ]
        ]);

        return json_encode(['status' => 'ok']);
    }

    /**
     * Helper to broadcast WebSocket message to a specific group.
     */
    private static function broadcastToGroup($groupId, $message)
    {
        $message['groupId'] = $groupId;
        $instance = @stream_socket_client("tcp://127.0.0.1:2346", $err1, $err2, 1);
        if ($instance) {
            fwrite($instance, json_encode($message) . "\n");
            fclose($instance);
        }
    }
}
