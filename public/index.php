<?php

error_reporting(E_ALL);

include '../app/Info.php';
include "../app/Database.php";
include "../app/Ajax.php";
include "../app/Security.php";
include "../app/App.php";

// Keep sessions alive for 3 hours (10800 seconds).
$sessionLifetime = 3 * 60 * 60;
ini_set('session.gc_maxlifetime', $sessionLifetime);
session_set_cookie_params([
    'lifetime' => $sessionLifetime,
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

Info::set('config', include '../app/config.php');

$database = new Database();
Info::set('db', $database);
Info::set('dbh', $database->db_handle());

$app = new App();

$app->run();
