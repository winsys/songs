<?php
/**
 * One-shot runner for add_observer_text.sql using the app's own DB config
 * (the mysql CLI on the server fails with "Malformed packet", PHP/mysqli
 * connects fine — same way app/Database.php does).
 *
 * Run on the server: php database/migrations/run_add_observer_text.php
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

$res = mysqli_query($ii, "SHOW COLUMNS FROM `current_observer` LIKE 'text'");
if ($res && mysqli_num_rows($res) > 0) {
    echo "SKIPPED, column current_observer.text already exists\n";
    exit(0);
}

$sql = "ALTER TABLE `current_observer`
  ADD COLUMN `text` text COMMENT 'Text overlay shown to observers (Bible verse / message paragraph); empty = none' AFTER `langs`,
  ADD COLUMN `title` varchar(255) NOT NULL DEFAULT '' COMMENT 'Caption of the text overlay (Bible reference / message title)' AFTER `text`";

if (!mysqli_query($ii, $sql)) {
    fwrite(STDERR, "query failed: " . mysqli_error($ii) . "\n");
    exit(1);
}

echo "MIGRATED, columns current_observer.text / title added\n";
