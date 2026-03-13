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

// [SECURITY] Track authenticated connections by userId
$authenticated_connections = [];

$ws_worker->onConnect = function($connection) use ($ws_worker) {
    // Connection not yet authenticated - will be validated on first message
    $connection->authenticated = false;
    $connection->userId = null;
};

$ws_worker->onMessage = function($connection, $data) use ($ws_worker, &$authenticated_connections) {
    // [SECURITY] First message must be authentication token
    if (!$connection->authenticated) {
        $auth_data = json_decode($data, true);

        if (!isset($auth_data['type']) || $auth_data['type'] !== 'auth') {
            $connection->send(json_encode(['error' => 'Authentication required']));
            $connection->close();
            return;
        }

        if (!isset($auth_data['token']) || !isset($auth_data['userId'])) {
            $connection->send(json_encode(['error' => 'Invalid auth data']));
            $connection->close();
            return;
        }

        // Validate token (simple token = hash of userId + secret key)
        $config = include __DIR__ . '/app/config_example.php';
        $expectedToken = hash_hmac('sha256', $auth_data['userId'], $config['encryption_key']);

        if (!hash_equals($expectedToken, $auth_data['token'])) {
            $connection->send(json_encode(['error' => 'Invalid token']));
            $connection->close();
            return;
        }

        // Authentication successful
        $connection->authenticated = true;
        $connection->userId = (int)$auth_data['userId'];

        // Store connection by userId
        if (!isset($authenticated_connections[$connection->userId])) {
            $authenticated_connections[$connection->userId] = [];
        }
        $authenticated_connections[$connection->userId][$connection->id] = $connection;

        $connection->send(json_encode(['type' => 'auth_success', 'message' => 'Authenticated']));
        return;
    }
    // Connection is authenticated - handle normal messages
    // (Currently this WebSocket only receives broadcasts from server, not from clients)
};

$ws_worker->onClose = function($connection) use ($ws_worker, &$authenticated_connections) {
    if ($connection->authenticated && $connection->userId) {
        unset($authenticated_connections[$connection->userId][$connection->id]);
        if (empty($authenticated_connections[$connection->userId])) {
            unset($authenticated_connections[$connection->userId]);
        }
    }
};

$ws_worker->onWorkerStart = function($ws_worker) use (&$authenticated_connections)
{
    $inner_worker = new Worker("text://127.0.0.1:2346");
    $inner_worker->name = 'AjaxWorker';

    $inner_worker->onMessage = function(TcpConnection $connection, $data) use ($ws_worker, &$authenticated_connections)
    {
        $clean_data = trim($data);
        $broadcast_data = json_decode($clean_data, true);

        // [SECURITY] Broadcast only to authenticated users
        // If userId is specified, send only to that user's connections
        if (isset($broadcast_data['userId'])) {
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
