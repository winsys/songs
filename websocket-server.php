<?php
use Workerman\Worker;
use Workerman\Connection\TcpConnection;
require_once __DIR__ . '/vendor/autoload.php';

// 1. Порт 2345 для браузеров (WebSocket)
$ws_worker = new Worker("websocket://0.0.0.0:2345");
$ws_worker->name = 'WebWorker';
$ws_worker->count = 1;

$ws_worker->onConnect = function($connection) use ($ws_worker) {
    $ws_worker->connections[$connection->id] = $connection;
};

$ws_worker->onClose = function($connection) use ($ws_worker) {
    unset($ws_worker->connections[$connection->id]);
};

$ws_worker->onWorkerStart = function($ws_worker)
{
    $inner_worker = new Worker("text://127.0.0.1:2346");
    $inner_worker->name = 'AjaxWorker';

    $inner_worker->onMessage = function(TcpConnection $connection, $data) use ($ws_worker)
    {
        $clean_data = trim($data);
        foreach ($ws_worker->connections as $client_connection) {
            $client_connection->send($clean_data);
        }
        $connection->close();
    };
    $inner_worker->listen();
};

Worker::runAll();
