<?php
/**
 * One-shot runner for add_streaming_font_max_size.sql using the app's own DB
 * config (the mysql CLI on the server fails with "Malformed packet",
 * PHP/mysqli connects fine — same way app/Database.php does).
 *
 * Run on the server: php database/migrations/run_add_streaming_font_max_size.php
 * Safe to re-run: checks for the column before adding it.
 */

$conf = include __DIR__ . '/../../app/config.php';
$db   = $conf['db'];

$ii = mysqli_init();
mysqli_options($ii, MYSQLI_READ_DEFAULT_FILE, '/etc/mysql/mysql.conf.d/mysqld.cnf');
if (!mysqli_real_connect($ii, $db['host'], $db['login'], $db['pass'], $db['database'], (int)$db['port'])) {
    fwrite(STDERR, "connect failed: " . mysqli_connect_error() . "\n");
    exit(1);
}

$res = mysqli_query($ii, "SHOW COLUMNS FROM `user_settings` LIKE 'streaming_font_max_size'");
if ($res && mysqli_num_rows($res) > 0) {
    echo "SKIPPED, column user_settings.streaming_font_max_size already exists\n";
    exit(0);
}

$sql = "ALTER TABLE `user_settings`
  ADD COLUMN `streaming_font_max_size` tinyint(3) unsigned NOT NULL DEFAULT '64'
  COMMENT 'Max auto-fit font size px for streaming text display (20-200)'
  AFTER `streaming_height_percent`";

if (!mysqli_query($ii, $sql)) {
    fwrite(STDERR, "query failed: " . mysqli_error($ii) . "\n");
    exit(1);
}

echo "MIGRATED, column user_settings.streaming_font_max_size added\n";
