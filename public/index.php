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

// session_set_cookie_params with array syntax requires PHP 7.3+.
// Use the old 5-argument form for compatibility with PHP 5.x / 7.0 / 7.1 / 7.2.
session_set_cookie_params(
    $sessionLifetime,   // lifetime
    '/',                // path
    '',                 // domain (empty = current)
    false,              // secure
    true                // httponly
);

session_start();

Info::set('config', include '../app/config.php');

$database = new Database();
Info::set('db', $database);
Info::set('dbh', $database->db_handle());

$app = new App();

$app->run();
