<?php
/**
 * One-shot runner for add_join_token.sql using the app's own DB config (the
 * mysql CLI on the server fails with "Malformed packet", PHP/mysqli connects
 * fine — same way app/Database.php does).
 *
 * Run on the server: php database/migrations/run_add_join_token.php
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

$res = mysqli_query($ii, "SHOW COLUMNS FROM `users` LIKE 'JOIN_TOKEN'");
if ($res && mysqli_num_rows($res) > 0) {
    echo "SKIPPED, column users.JOIN_TOKEN already exists\n";
    exit(0);
}

$sql = "ALTER TABLE `users`
  ADD COLUMN `JOIN_TOKEN` varchar(64) DEFAULT NULL
  COMMENT 'Auto-login token for the /join/<token> link (observer accounts only); NULL = no link issued'
  AFTER `GROUP_ID`,
  ADD UNIQUE KEY `idx_join_token` (`JOIN_TOKEN`)";

if (!mysqli_query($ii, $sql)) {
    fwrite(STDERR, "query failed: " . mysqli_error($ii) . "\n");
    exit(1);
}

echo "MIGRATED, column users.JOIN_TOKEN added\n";
