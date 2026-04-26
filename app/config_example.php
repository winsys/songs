<?php

return array(
    "db" => array(
        'host' => 'localhost',
        'login' => 'songs',
        'pass' => 'local123',
        'database' => 'songs',
        'port' => '33306',
    ),
    "encryption_key" => "....",           // base64-encoded 32-byte key: php -r "echo base64_encode(random_bytes(32));"
    "lang_delete_password" => '...',
    "GOOGLE_CLIENT_ID"     => "",         // Google OAuth Client ID (from console.cloud.google.com)
    "GOOGLE_CLIENT_SECRET" => "",         // Google OAuth Client Secret
);