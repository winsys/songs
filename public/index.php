<?php

// Show PHP errors only in development mode.
// On the server set APP_ENV=production (or leave the variable unset).
if (getenv('APP_ENV') === 'development') {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    error_reporting(0);
    ini_set('display_errors', '0');
}

include '../app/Info.php';
include "../app/Database.php";
include "../app/Ajax_Common.php";
include "../app/Ajax_Tech.php";
include "../app/Ajax_Sermon.php";
include "../app/Ajax_Settings.php";
include "../app/Ajax_Import.php";
include "../app/Ajax.php";
include "../app/Security.php";
include "../app/GoogleAuth.php";
include "../app/Mailer.php";
include "../app/Signup.php";
include "../app/T.php";
include "../app/App.php";

// Keep sessions alive for 18 hours (64800 seconds).
$sessionLifetime = 18 * 60 * 60;
ini_set('session.gc_maxlifetime', $sessionLifetime);

// Secure flag must match the actual scheme: on HTTPS (production) the cookie
// is HTTPS-only, but over plain HTTP (offline LAN copy) browsers REJECT
// cookies marked Secure — login would silently fail.
$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['SERVER_PORT'] ?? null) == 443);

session_set_cookie_params(
    $sessionLifetime,   // lifetime
    '/',                // path
    '',                 // domain (empty = current)
    $isHttps,           // secure: HTTPS only when actually on HTTPS
    true                // httponly: not accessible from JS
);

session_start();

Info::set('config', include '../app/config.php');

$database = new Database();
Info::set('db', $database);
Info::set('dbh', $database->db_handle());

Security::initCsrfToken();

// Expire display access approvals older than 24 hours
$database->exec(
    "DELETE FROM display_access_requests
     WHERE status = 'approved' AND responded_at < NOW() - INTERVAL 24 HOUR"
);

$app = new App();
$app->run();
