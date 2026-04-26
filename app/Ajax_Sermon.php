<?php

/**
 * Sermon page Ajax methods
 * Handles sermon CRUD operations, uploads, and settings
 */
trait Ajax_Sermon
{
    private static function preacherSeesAll(): bool
    {
        if (!Security::isPreacher()) return false;
        $curUserId = isset($_SESSION['curUserId']) ? (int)$_SESSION['curUserId'] : 0;
        if ($curUserId <= 0) return true;
        $row = Info::get('db')->get(
            "SELECT id FROM user_google_accounts WHERE user_id = {$curUserId} LIMIT 1"
        );
        if ($row) return false;
        // Legacy GOOGLE_ID field fallback
        $row2 = Info::get('db')->get(
            "SELECT ID FROM users WHERE ID = {$curUserId} AND GOOGLE_ID IS NOT NULL AND GOOGLE_ID != '' LIMIT 1"
        );
        return !$row2;
    }

    private static function getCurrentGoogleId(): ?string
    {
        $curUserId = isset($_SESSION['curUserId']) ? (int)$_SESSION['curUserId'] : 0;
        if ($curUserId <= 0) return null;
        $row = Info::get('db')->get(
            "SELECT google_id FROM user_google_accounts WHERE user_id = {$curUserId} LIMIT 1"
        );
        if ($row) return $row['google_id'];
        // Legacy fallback
        $row2 = Info::get('db')->get(
            "SELECT GOOGLE_ID FROM users WHERE ID = {$curUserId} AND GOOGLE_ID IS NOT NULL AND GOOGLE_ID != '' LIMIT 1"
        );
        return $row2 ? $row2['GOOGLE_ID'] : null;
    }

    private static function get_sermon_list()
    {
        $userId     = (int)$_SESSION['curGroupId'];
        $isPreacher = Security::isPreacher();
        $googleId   = $isPreacher ? self::getCurrentGoogleId() : null;

        if ($isPreacher && $googleId !== null) {
            // Preacher WITH Google account: own sermons only, can delete authored ones
            $esc  = mysqli_real_escape_string(Info::get('dbh'), $googleId);
            $list = Info::get('db')->select(
                "SELECT ID, TITLE, SERMON_DATE, UPDATED_AT,
                        CASE WHEN AUTHOR_GOOGLE_ID = '{$esc}' THEN 1 ELSE 0 END AS CAN_DELETE
                 FROM sermons
                 WHERE USER_ID = {$userId}
                   AND (AUTHOR_GOOGLE_ID = '{$esc}' OR AUTHOR_GOOGLE_ID IS NULL)
                 ORDER BY SERMON_DATE DESC, UPDATED_AT DESC"
            );
        } elseif ($isPreacher) {
            // Preacher WITHOUT Google account: sees all groups, cannot delete.
            // OWNER_NAME fallback ("Group #N") is applied in PHP so it can be localized via T::s().
            $list = Info::get('db')->select(
                "SELECT s.ID, s.TITLE, s.SERMON_DATE, s.UPDATED_AT, s.USER_ID,
                        0 AS CAN_DELETE,
                        CASE WHEN s.USER_ID = {$userId} THEN NULL
                             ELSE us.display_name
                        END AS OWNER_NAME
                 FROM sermons s
                 LEFT JOIN user_settings us ON us.group_id = s.USER_ID
                 ORDER BY s.SERMON_DATE DESC, s.UPDATED_AT DESC"
            );
            foreach ($list as &$row) {
                if ((int)$row['USER_ID'] !== $userId && empty($row['OWNER_NAME'])) {
                    $row['OWNER_NAME'] = T::s('sermon.display.groupN', ['id' => $row['USER_ID']]);
                }
            }
            unset($row);
        } else {
            // Non-preacher (admin, leader, etc.): own group, can delete
            $list = Info::get('db')->select(
                "SELECT ID, TITLE, SERMON_DATE, UPDATED_AT, 1 AS CAN_DELETE
                 FROM sermons
                 WHERE USER_ID = {$userId}
                 ORDER BY SERMON_DATE DESC, UPDATED_AT DESC"
            );
        }
        return json_encode($list);
    }

    private static function get_sermon()
    {
        $userId     = (int)$_SESSION['curGroupId'];
        $sermonId   = (int)self::$args['id'];
        $isPreacher = Security::isPreacher();
        $googleId   = $isPreacher ? self::getCurrentGoogleId() : null;

        if ($isPreacher && $googleId !== null) {
            // Preacher with Google: own sermons in group only
            $esc = mysqli_real_escape_string(Info::get('dbh'), $googleId);
            $row = Info::get('db')->get(
                "SELECT ID, TITLE, SERMON_DATE, CONTENT FROM sermons
                 WHERE ID = {$sermonId} AND USER_ID = {$userId}
                   AND (AUTHOR_GOOGLE_ID = '{$esc}' OR AUTHOR_GOOGLE_ID IS NULL)
                 LIMIT 1"
            );
        } elseif ($isPreacher) {
            // Preacher without Google: sees all
            $row = Info::get('db')->get(
                "SELECT ID, TITLE, SERMON_DATE, CONTENT FROM sermons
                 WHERE ID = {$sermonId} LIMIT 1"
            );
        } else {
            // Non-preacher: own group only
            $row = Info::get('db')->get(
                "SELECT ID, TITLE, SERMON_DATE, CONTENT FROM sermons
                 WHERE ID = {$sermonId} AND USER_ID = {$userId} LIMIT 1"
            );
        }
        return json_encode($row ?: null);
    }

    private static function save_sermon()
    {
        $userId = (int)$_SESSION['curGroupId'];
        $dbh    = Info::get('dbh');

        $sermonId = isset(self::$args['id']) ? (int)self::$args['id'] : 0;
        $title    = isset(self::$args['title'])       ? mysqli_real_escape_string($dbh, self::$args['title'])       : '';
        $date     = isset(self::$args['sermon_date']) ? mysqli_real_escape_string($dbh, self::$args['sermon_date']) : '';
        $content  = isset(self::$args['content'])     ? mysqli_real_escape_string($dbh, self::$args['content'])     : '';

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

        $isPreacher        = Security::isPreacher();
        $authorGoogleId    = $isPreacher ? self::getCurrentGoogleId() : null;
        $authorGoogleIdVal = ($authorGoogleId !== null)
            ? "'" . mysqli_real_escape_string($dbh, $authorGoogleId) . "'"
            : 'NULL';

        $dbh->query(
            "INSERT INTO sermons (USER_ID, TITLE, SERMON_DATE, CONTENT, AUTHOR_GOOGLE_ID)
             VALUES ({$userId}, '{$title}', {$dateVal}, '{$content}', {$authorGoogleIdVal})"
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
        $userId     = (int)$_SESSION['curGroupId'];
        $sermonId   = (int)self::$args['id'];
        $isPreacher = Security::isPreacher();
        $googleId   = $isPreacher ? self::getCurrentGoogleId() : null;

        if ($isPreacher && $googleId === null) {
            return json_encode(['status' => 'error', 'message' => T::s('sermon.error.googleRequired')]);
        }

        $ownerCond = ($googleId !== null)
            ? "AND USER_ID = {$userId} AND AUTHOR_GOOGLE_ID = '" . mysqli_real_escape_string(Info::get('dbh'), $googleId) . "'"
            : "AND USER_ID = {$userId}";

        // Delete uploaded media files referenced in the sermon content
        $row = Info::get('db')->get(
            "SELECT CONTENT FROM sermons WHERE ID = {$sermonId} {$ownerCond} LIMIT 1"
        );
        if ($row && !empty($row['CONTENT'])) {
            $allowedPrefixes = [
                '/sermon_images/' . $userId . '/',
                '/sermon_videos/' . $userId . '/',
            ];
            preg_match_all('/(\/sermon_(?:images|videos)\/' . $userId . '\/[^"\'<>\s]+)/', $row['CONTENT'], $matches);
            foreach ($matches[1] as $path) {
                $isAllowed = false;
                foreach ($allowedPrefixes as $prefix) {
                    if (strpos($path, $prefix) === 0) { $isAllowed = true; break; }
                }
                if ($isAllowed) {
                    $filePath = __DIR__ . '/../public' . $path;
                    if (file_exists($filePath)) {
                        unlink($filePath);
                    }
                }
            }
        }

        Info::get('db')->exec(
            "DELETE FROM sermons WHERE ID = {$sermonId} {$ownerCond}"
        );
        return json_encode(array('status' => 'ok'));
    }

    private static function upload_sermon_image()
    {
        $userId = (int)$_SESSION['curGroupId'];

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

        // [SECURITY #5] Validate file extension
        $ext         = strtolower(pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION));
        $allowedExt  = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        if (!in_array($ext, $allowedExt, true)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid file type: ' . $ext]);
        }

        // [SECURITY #5] Validate actual MIME type
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
     * Upload a video file for a sermon.
     * Input: multipart file 'video'
     * Output: { status, path, name }
     */
    private static function upload_sermon_video()
    {
        $userId = (int)$_SESSION['curGroupId'];

        if (!isset($_FILES['video']) || $_FILES['video']['error'] !== UPLOAD_ERR_OK) {
            $code = isset($_FILES['video']) ? $_FILES['video']['error'] : -1;
            return json_encode(['status' => 'error', 'message' => 'Upload error code: ' . $code]);
        }

        // [SECURITY #5] Validate file extension
        $ext         = strtolower(pathinfo($_FILES['video']['name'], PATHINFO_EXTENSION));
        $allowedExt  = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'];
        if (!in_array($ext, $allowedExt, true)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid video type: ' . $ext]);
        }

        // [SECURITY #5] Validate actual MIME type
        $allowedMime = [
            'video/mp4', 'video/webm', 'video/ogg',
            'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
            'application/octet-stream', // some .mkv/.mov files
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
        $userId = (int)$_SESSION['curGroupId'];

        $prepFontSize = isset(self::$args['sermon_prep_font_size'])
            ? max(10, min(22,  intval(self::$args['sermon_prep_font_size'])))
            : null;
        $fontSize = isset(self::$args['sermon_notes_font_size'])
            ? max(50, min(300, intval(self::$args['sermon_notes_font_size'])))
            : null;
        $scale = isset(self::$args['sermon_scale_chips'])
            ? max(0,  min(1,   intval(self::$args['sermon_scale_chips'])))
            : null;

        // Build SET clause from only the fields that were provided
        $sets = [];
        if ($fontSize    !== null) $sets[] = "sermon_notes_font_size = {$fontSize}";
        if ($prepFontSize !== null) $sets[] = "sermon_prep_font_size = {$prepFontSize}";
        if ($scale       !== null) $sets[] = "sermon_scale_chips = {$scale}";

        if (empty($sets)) return json_encode(['status' => 'success']);

        // INSERT creates the row if it doesn't exist yet; ON DUPLICATE KEY only
        // updates the provided fields without touching the rest of user_settings.
        $insertFontSize = $fontSize    ?? 100;
        $insertPrepFont = $prepFontSize ?? 13;
        $insertScale    = $scale       ?? 0;
        $updateClause   = implode(', ', $sets);

        Info::get('db')->exec("
            INSERT INTO user_settings (group_id, sermon_notes_font_size, sermon_prep_font_size, sermon_scale_chips)
            VALUES ({$userId}, {$insertFontSize}, {$insertPrepFont}, {$insertScale})
            ON DUPLICATE KEY UPDATE {$updateClause}
        ");

        return json_encode(['status' => 'success']);
    }

    /**
     * Delete a sermon media file (image or video).
     * Params: path (relative path such as /sermon_images/123/img_abc.jpg)
     */
    private static function delete_sermon_media()
    {
        $userId = (int)$_SESSION['curGroupId'];
        $path   = isset(self::$args['path']) ? self::$args['path'] : '';

        if (empty($path)) {
            return json_encode(['status' => 'error', 'message' => 'Empty path']);
        }

        // Verify the path is within the allowed user directories
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

        $filePath = __DIR__ . '/../public' . $path;

        // Delete the file if it exists
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
        $userId = (int)$_SESSION['curGroupId'];

        // Own group (userId in session is actually the GROUP_ID)
        $ownGroup = Info::get('db')->get(
            "SELECT us.group_id, us.display_name
             FROM user_settings us
             WHERE us.group_id = {$userId}
             LIMIT 1"
        );

        $targets = [];
        if ($ownGroup) {
            $targets[] = [
                'group_id' => $userId,
                'display_name' => $ownGroup['display_name'] ?: T::s('sermon.display.myDisplay'),
                'is_own' => true
            ];
        }

        // Groups that approved access
        $approved = Info::get('db')->select(
            "SELECT dar.target_group_id, us.display_name
             FROM display_access_requests dar
             LEFT JOIN user_settings us ON us.group_id = dar.target_group_id
             WHERE dar.requester_group_id = {$userId} AND dar.status = 'approved'"
        );

        foreach ($approved as $row) {
            $targets[] = [
                'group_id' => (int)$row['target_group_id'],
                'display_name' => $row['display_name'] ?: T::s('sermon.display.groupN', ['id' => $row['target_group_id']]),
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
        $userId = (int)$_SESSION['curGroupId'];

        // Get all groups except own
        $allGroups = Info::get('db')->select(
            "SELECT DISTINCT u.GROUP_ID as group_id, us.display_name
             FROM users u
             LEFT JOIN user_settings us ON us.group_id = u.GROUP_ID
             WHERE u.GROUP_ID != {$userId} AND u.GROUP_ID > 0 AND NOT (us.display_name IS NULL)
             GROUP BY u.GROUP_ID"
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
                    'display_name' => $group['display_name'] ?: T::s('sermon.display.groupN', ['id' => $gid])
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
        $userId        = (int)$_SESSION['curGroupId'];
        $targetGroupId = isset(self::$args['target_group_id']) ? (int)self::$args['target_group_id'] : 0;

        if ($targetGroupId <= 0 || $targetGroupId === $userId) {
            return json_encode(['status' => 'error', 'message' => 'Invalid target group']);
        }

        // Get requester's display name
        $requester = Info::get('db')->get(
            "SELECT us.display_name
             FROM user_settings us
             WHERE us.group_id = {$userId}
             LIMIT 1"
        );
        $requesterName = $requester ? ($requester['display_name'] ?: T::s('sermon.display.groupN', ['id' => $userId])) : T::s('sermon.display.groupN', ['id' => $userId]);

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
        $userId = (int)$_SESSION['curGroupId'];

        $requests = Info::get('db')->select(
            "SELECT dar.id, dar.requester_group_id, dar.requested_at,
                    (SELECT us.display_name
                     FROM user_settings us
                     WHERE us.group_id = dar.requester_group_id
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
                'requester_name' => $req['display_name'] ?: T::s('sermon.display.groupN', ['id' => $req['requester_group_id']]),
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
        $userId    = (int)$_SESSION['curGroupId'];
        $requestId = isset(self::$args['request_id']) ? (int)self::$args['request_id'] : 0;
        $action    = isset(self::$args['action']) ? self::$args['action'] : '';

        if (!in_array($action, ['approve', 'reject'])) {
            return json_encode(['status' => 'error', 'message' => 'Invalid action']);
        }

        // Verify this request is for current group and get requester info
        $request = Info::get('db')->get(
            "SELECT dar.id, dar.requester_group_id, us.display_name as target_name
             FROM display_access_requests dar
             LEFT JOIN user_settings us ON us.group_id = dar.target_group_id
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
        $targetName = $request['target_name'] ?: T::s('sermon.display.groupN', ['id' => $userId]);
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
     * Import PowerPoint/ODP file: convert pages to PNG images and return paths.
     * Input: multipart file 'pptx'
     * Output: { status, paths: ['/sermon_slides/123/slide_001.png', ...] }
     */
    private static function import_pptx()
    {
        $userId = (int)$_SESSION['curGroupId'];

        if (!isset($_FILES['pptx']) || $_FILES['pptx']['error'] !== UPLOAD_ERR_OK) {
            $code = isset($_FILES['pptx']) ? $_FILES['pptx']['error'] : -1;
            return json_encode(['status' => 'error', 'message' => 'Upload error code: ' . $code]);
        }

        $ext        = strtolower(pathinfo($_FILES['pptx']['name'], PATHINFO_EXTENSION));
        $allowedExt = ['pptx', 'ppt', 'odp'];
        if (!in_array($ext, $allowedExt, true)) {
            return json_encode(['status' => 'error', 'message' => 'Invalid file type: ' . $ext]);
        }

        // Temporary working directory
        $tmpDir = sys_get_temp_dir() . '/pptx_import_' . uniqid('', true);
        if (!mkdir($tmpDir, 0700, true)) {
            return json_encode(['status' => 'error', 'message' => 'Cannot create temp dir']);
        }

        $tmpFile = $tmpDir . '/input.' . $ext;
        if (!move_uploaded_file($_FILES['pptx']['tmp_name'], $tmpFile)) {
            self::_rmdir($tmpDir);
            return json_encode(['status' => 'error', 'message' => 'move_uploaded_file failed']);
        }

        // Step 1: Find LibreOffice binary
        $libreofficeBin = null;
        $loCandidates = [
            '/usr/bin/libreoffice',
            '/usr/bin/soffice',
            '/usr/lib/libreoffice/program/soffice',
        ];
        foreach (glob('/opt/libreoffice*/program/soffice') ?: [] as $p) {
            $loCandidates[] = $p;
        }
        foreach ($loCandidates as $bin) {
            if (is_file($bin) && is_executable($bin)) { $libreofficeBin = $bin; break; }
        }
        // Fallback: try `which`
        if (!$libreofficeBin) {
            foreach (['libreoffice', 'soffice'] as $name) {
                $found = trim(shell_exec('which ' . escapeshellarg($name) . ' 2>/dev/null'));
                if ($found && is_executable($found)) { $libreofficeBin = $found; break; }
            }
        }
        if (!$libreofficeBin) {
            self::_rmdir($tmpDir);
            return json_encode(['status' => 'error',
                'message' => T::s('ajax.error.libreOfficeMissing')]);
        }

        // Step 2: Convert to PDF with LibreOffice
        $pdfFile = $tmpDir . '/input.pdf';
        $cmd = escapeshellarg($libreofficeBin) . ' --headless --convert-to pdf ' .
               '--outdir ' . escapeshellarg($tmpDir) . ' ' .
               escapeshellarg($tmpFile) . ' 2>&1';
        exec($cmd, $out, $ret);

        if ($ret !== 0 || !file_exists($pdfFile)) {
            self::_rmdir($tmpDir);
            return json_encode(['status' => 'error',
                'message' => 'LibreOffice conversion failed: ' . implode(' ', $out)]);
        }

        // Step 3: Convert PDF pages to PNG
        $pngDir = $tmpDir . '/pages';
        mkdir($pngDir, 0700, true);

        // Try Ghostscript first, then ImageMagick
        $gsBin      = trim(shell_exec('which gs 2>/dev/null'));
        $convertBin = trim(shell_exec('which convert 2>/dev/null'));
        if ($gsBin && is_executable($gsBin)) {
            $cmd = escapeshellarg($gsBin) . ' -dNOPAUSE -dBATCH -sDEVICE=png16m -r150 ' .
                   '-sOutputFile=' . escapeshellarg($pngDir . '/slide_%03d.png') . ' ' .
                   escapeshellarg($pdfFile) . ' 2>&1';
            exec($cmd, $out2, $ret2);
        } elseif ($convertBin && is_executable($convertBin)) {
            $cmd = escapeshellarg($convertBin) . ' -density 150 -quality 90 ' .
                   escapeshellarg($pdfFile) . ' ' .
                   escapeshellarg($pngDir . '/slide_%03d.png') . ' 2>&1';
            exec($cmd, $out2, $ret2);
        } else {
            self::_rmdir($tmpDir);
            return json_encode(['status' => 'error',
                'message' => T::s('ajax.error.ghostscriptMissing')]);
        }

        $pngs = glob($pngDir . '/slide_*.png');
        if (empty($pngs)) {
            self::_rmdir($tmpDir);
            return json_encode(['status' => 'error',
                'message' => 'PNG conversion failed: ' . implode(' ', $out2)]);
        }
        sort($pngs);

        // Step 3: Move images to public dir
        $publicDir = __DIR__ . '/../public/sermon_slides/' . $userId . '/';
        if (!file_exists($publicDir) && !mkdir($publicDir, 0755, true)) {
            self::_rmdir($tmpDir);
            return json_encode(['status' => 'error', 'message' => 'Cannot create public dir']);
        }

        $prefix  = uniqid('slide_', true) . '_';
        $webPaths = [];
        foreach ($pngs as $i => $png) {
            $filename = $prefix . sprintf('%03d', $i + 1) . '.png';
            rename($png, $publicDir . $filename);
            $webPaths[] = '/sermon_slides/' . $userId . '/' . $filename;
        }

        self::_rmdir($tmpDir);
        return json_encode(['status' => 'success', 'paths' => $webPaths]);
    }

    /** Recursively remove a directory */
    private static function _rmdir($dir)
    {
        if (!is_dir($dir)) return;
        $files = scandir($dir);
        foreach ($files as $f) {
            if ($f === '.' || $f === '..') continue;
            $path = $dir . '/' . $f;
            is_dir($path) ? self::_rmdir($path) : unlink($path);
        }
        rmdir($dir);
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
