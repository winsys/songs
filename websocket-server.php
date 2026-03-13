<?php
use Workerman\Worker;
use Workerman\Connection\TcpConnection;
require_once __DIR__ . '/vendor/autoload.php';

// [SECURITY] Load database config for session validation
require_once __DIR__ . '/app/Info.php';
require_once __DIR__ . '/app/Database.php';

// 1. Порт 2345 для браузеров (WebSocket)
$ws_worker = new Worker("websocket://127.0.0.1:2345");  // [SECURITY] Bind to localhost only
$ws_worker->name = 'WebWorker';
$ws_worker->count = 1;

// [SECURITY] Track authenticated connections by userId and groupId
$authenticated_connections = [];
$connections_by_group = [];  // groupId => [connection, ...]

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

        // Authentication successful
        $connection->authenticated = true;
        $connection->userId = (int)$auth_data['userId'];
        $connection->groupId = isset($auth_data['groupId']) ? (int)$auth_data['groupId'] : null;

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
    // Connection is authenticated - handle normal messages
    // (Currently this WebSocket only receives broadcasts from server, not from clients)
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
