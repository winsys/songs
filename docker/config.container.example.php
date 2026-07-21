<?php

// Template for docker/config.container.php (git-ignored), which is
// bind-mounted over app/config.php INSIDE the web container only.
// tools/offline_sync.sh generates the real file from the production config.
//
// encryption_key MUST match production: stored passwords ("enc:" prefixed)
// and WebSocket HMAC tokens are derived from it. With a different key no
// existing user can log in.
return array(
    "db" => array(
        'host' => 'db',                     // compose service name
        'login' => 'songs',
        'pass' => '<DB_PASSWORD from docker/.env>',
        'database' => 'songs',
        'port' => '3306',
    ),
    "encryption_key" => "<copy from production app/config.php>",
    "lang_delete_password" => '<copy from production app/config.php>',
    "GOOGLE_CLIENT_ID" => "",               // Google login is unavailable offline
    "GOOGLE_CLIENT_SECRET" => "",
);
