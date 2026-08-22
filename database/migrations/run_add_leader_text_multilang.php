<?php
/**
 * One-shot runner for add_leader_text_multilang.sql using the app's own DB
 * config (the mysql CLI on the server fails with "Malformed packet",
 * PHP/mysqli connects fine — same way app/Database.php does).
 *
 * Run on the server: php database/migrations/run_add_leader_text_multilang.php
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

$res = mysqli_query($ii, "SHOW COLUMNS FROM `user_settings` LIKE 'leader_text_multilang'");
if ($res && mysqli_num_rows($res) > 0) {
    echo "SKIPPED, column user_settings.leader_text_multilang already exists\n";
    exit(0);
}

$sql = "ALTER TABLE `user_settings`
  ADD COLUMN `leader_text_multilang` tinyint(1) NOT NULL DEFAULT '0'
  COMMENT 'Leader verse mode: 1 = several languages selectable at once'
  AFTER `ui_lang`";

if (!mysqli_query($ii, $sql)) {
    fwrite(STDERR, "query failed: " . mysqli_error($ii) . "\n");
    exit(1);
}

echo "MIGRATED, column user_settings.leader_text_multilang added\n";
