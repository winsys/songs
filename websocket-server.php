<?php
use Workerman\Worker;
use Workerman\Connection\TcpConnection;
require_once __DIR__ . '/vendor/autoload.php';

// [SECURITY] Load database config for session validation
require_once __DIR__ . '/app/Info.php';
require_once __DIR__ . '/app/Database.php';

// 1. Port 2345 for browsers (WebSocket)
$ws_worker = new Worker("websocket://127.0.0.1:2345");  // [SECURITY] Bind to localhost only
$ws_worker->name = 'WebWorker';
$ws_worker->count = 1;

// [SECURITY] Track authenticated connections by userId and groupId
$authenticated_connections = [];
$connections_by_group = [];  // groupId => [connection, ...]

/**
 * [SECURITY] Resolve the user's real group from the database — same rule as
 * Security::startUserSession (GROUP_ID when set, else the user's own ID).
 * The client-claimed groupId is never trusted: a connection may only ever
 * subscribe to its own group's events. Opens a short-lived connection per
 * auth (auth happens once per WS connection) so a long-idle persistent
 * handle can't go stale. Returns null when the lookup fails — such a
 * connection receives no group-scoped broadcasts at all.
 */
function ws_resolve_group_id($userId, $config)
{
    if ($userId <= 0 || !isset($config['db'])) return null;
    $db = $config['db'];
    $ii = mysqli_init();
    // Same connect path as app/Database.php (prod mysql CLI is broken; the
    // options file / socket are simply ignored where they don't exist).
    @mysqli_options($ii, MYSQLI_READ_DEFAULT_FILE, '/etc/mysql/mysql.conf.d/mysqld.cnf');
    if (!@mysqli_real_connect(
        $ii, $db['host'], $db['login'], $db['pass'], $db['database'],
        (int)$db['port'], '/var/run/mysqld/mysqld.sock'
    )) {
        return null;
    }
    $groupId = null;
    $res = mysqli_query($ii, "SELECT ID, GROUP_ID FROM users WHERE ID = " . (int)$userId);
    if ($res && ($row = mysqli_fetch_assoc($res))) {
        $groupId = ((int)$row['GROUP_ID'] > 0) ? (int)$row['GROUP_ID'] : (int)$row['ID'];
    }
    mysqli_close($ii);
    return $groupId;
}

$ws_worker->onConnect = function($connection) use ($ws_worker) {
    // Connection not yet authenticated - will be validated on first message
    $connection->authenticated = false;
    $connection->userId = null;
    $connection->groupId = null;
};

$ws_worker->onMessage = function($connection, $data) use ($ws_worker, &$authenticated_connections, &$connections_by_group) {
    // [SECURITY] First message must be authentication token
    if (!$connection->authenticated) {
        $auth_data = json_decode($data, true);

        if (!isset($auth_data['type']) || $auth_data['type'] !== 'auth') {
            $connection->send(json_encode(['error' => 'Authentication required']));
            $connection->close();
            return;
        }

        if (!isset($auth_data['userId'])) {
            $connection->send(json_encode(['error' => 'Invalid auth data - missing userId']));
            $connection->close();
            return;
        }

        // Validate token (simple token = hash of userId + secret key)
        $config = include __DIR__ . '/app/config.php';
        $userId = $auth_data['userId'];
        $expectedToken = hash_hmac('sha256', $userId, $config['encryption_key']);
        $providedToken = isset($auth_data['token']) ? $auth_data['token'] : '';

        // Token must match (even for userId=0, empty token should match hash of '0')
        if (!hash_equals($expectedToken, $providedToken)) {
            $connection->send(json_encode(['error' => 'Invalid token']));
            $connection->close();
            return;
        }

        // [SECURITY] Group membership comes from the database, never from the
        // client's claim (the HMAC token only covers userId, so the claimed
        // groupId is unauthenticated and could subscribe to any group).
        // A failed lookup (DB briefly down) rejects the auth: the client's
        // auto-reconnect retries, instead of silently staying deaf to its
        // group's events on a "healthy" connection.
        $userIdInt = (int)$auth_data['userId'];
        $resolvedGroupId = ws_resolve_group_id($userIdInt, $config);
        if ($userIdInt > 0 && $resolvedGroupId === null) {
            $connection->send(json_encode(['error' => 'Group resolution failed']));
            $connection->close();
            return;
        }

        // Authentication successful
        $connection->authenticated = true;
        $connection->userId = $userIdInt;
        $connection->groupId = $resolvedGroupId;

        // Store connection by userId
        if (!isset($authenticated_connections[$connection->userId])) {
            $authenticated_connections[$connection->userId] = [];
        }
        $authenticated_connections[$connection->userId][$connection->id] = $connection;

        // Store connection by groupId (if provided)
        if ($connection->groupId !== null) {
            if (!isset($connections_by_group[$connection->groupId])) {
                $connections_by_group[$connection->groupId] = [];
            }
            $connections_by_group[$connection->groupId][$connection->id] = $connection;
        }

        $connection->send(json_encode(['type' => 'auth_success', 'message' => 'Authenticated']));
        return;
    }
    // Connection is authenticated — handle application-level ping/keepalive
    $msg = json_decode($data, true);
    if (is_array($msg) && isset($msg['type']) && $msg['type'] === 'ping') {
        $connection->send(json_encode(['type' => 'pong']));
    }
};

$ws_worker->onClose = function($connection) use ($ws_worker, &$authenticated_connections, &$connections_by_group) {
    if ($connection->authenticated && $connection->userId) {
        unset($authenticated_connections[$connection->userId][$connection->id]);
        if (empty($authenticated_connections[$connection->userId])) {
            unset($authenticated_connections[$connection->userId]);
        }
    }
    if ($connection->authenticated && $connection->groupId) {
        unset($connections_by_group[$connection->groupId][$connection->id]);
        if (empty($connections_by_group[$connection->groupId])) {
            unset($connections_by_group[$connection->groupId]);
        }
    }
};

$ws_worker->onWorkerStart = function($ws_worker) use (&$authenticated_connections, &$connections_by_group)
{
    $inner_worker = new Worker("text://127.0.0.1:2346");
    $inner_worker->name = 'AjaxWorker';

    $inner_worker->onMessage = function(TcpConnection $connection, $data) use ($ws_worker, &$authenticated_connections, &$connections_by_group)
    {
        $clean_data = trim($data);
        $broadcast_data = json_decode($clean_data, true);

        // [SECURITY] Broadcast only to authenticated users
        // Priority: groupId > userId > broadcast all
        if (isset($broadcast_data['groupId'])) {
            // Send to all users in a specific group
            $targetGroupId = (int)$broadcast_data['groupId'];
            if (isset($connections_by_group[$targetGroupId])) {
                foreach ($connections_by_group[$targetGroupId] as $client_connection) {
                    $client_connection->send($clean_data);
                }
            }
        } elseif (isset($broadcast_data['userId'])) {
            // Send to specific user's connections
            $targetUserId = (int)$broadcast_data['userId'];
            if (isset($authenticated_connections[$targetUserId])) {
                foreach ($authenticated_connections[$targetUserId] as $client_connection) {
                    $client_connection->send($clean_data);
                }
            }
        } else {
            // Broadcast to all authenticated connections
            foreach ($authenticated_connections as $userId => $connections) {
                foreach ($connections as $client_connection) {
                    $client_connection->send($clean_data);
                }
            }
        }

        $connection->close();
    };
    $inner_worker->listen();
};

Worker::runAll();
