<?php

error_reporting(E_ALL);

include '../app/Info.php';
include "../app/Database.php";
include "../app/Ajax_Common.php";
include "../app/Ajax_Tech.php";
include "../app/Ajax_Sermon.php";
include "../app/Ajax_Settings.php";
include "../app/Ajax_Import.php";
include "../app/Ajax.php";
include "../app/Security.php";
include "../app/App.php";

// Keep sessions alive for 3 hours (10800 seconds).
$sessionLifetime = 3 * 60 * 60;
ini_set('session.gc_maxlifetime', $sessionLifetime);

session_set_cookie_params(
    $sessionLifetime,   // lifetime
    '/',                // path
    '',                 // domain (empty = current)
    true,               // только HTTPS
    true                // httponly: недоступен из JS
);

session_start();

Info::set('config', include '../app/config.php');

$database = new Database();
Info::set('db', $database);
Info::set('dbh', $database->db_handle());

Security::initCsrfToken();

$app = new App();
$app->run();
