<?php
/**
 * One-shot runner for add_observer_mode.sql using the app's own DB config
 * (the mysql CLI on the server fails with "Malformed packet", PHP/mysqli
 * connects fine — same way app/Database.php does).
 *
 * Run on the server: php database/migrations/run_add_observer_mode.php
 * Safe to re-run: every step checks the current state before changing it.
 */

$conf = include __DIR__ . '/../../app/config.php';
$db   = $conf['db'];

$ii = mysqli_init();
mysqli_options($ii, MYSQLI_READ_DEFAULT_FILE, '/etc/mysql/mysql.conf.d/mysqld.cnf');
if (!mysqli_real_connect($ii, $db['host'], $db['login'], $db['pass'], $db['database'], (int)$db['port'])) {
    fwrite(STDERR, "connect failed: " . mysqli_connect_error() . "\n");
    exit(1);
}

// 1. users.ROLE enum gets the 'observer' member
$res = mysqli_query($ii, "SHOW COLUMNS FROM `users` LIKE 'ROLE'");
$row = $res ? mysqli_fetch_assoc($res) : null;
if ($row && strpos((string)$row['Type'], "'observer'") !== false) {
    echo "SKIPPED, users.ROLE already contains 'observer'\n";
} else {
    $sql = "ALTER TABLE `users`
      MODIFY `ROLE` enum('admin','leader','musician','preacher','tech','screen','observer') NOT NULL DEFAULT 'musician'";
    if (!mysqli_query($ii, $sql)) {
        fwrite(STDERR, "query failed: " . mysqli_error($ii) . "\n");
        exit(1);
    }
    echo "MIGRATED, users.ROLE now contains 'observer'\n";
}

// 2. current_observer table (the observer channel)
$res = mysqli_query($ii, "SHOW TABLES LIKE 'current_observer'");
if ($res && mysqli_num_rows($res) > 0) {
    echo "SKIPPED, table current_observer already exists\n";
} else {
    $sql = "CREATE TABLE IF NOT EXISTS `current_observer` (
      `groupId` int(11) NOT NULL,
      `active` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = the leader broadcasts to observers (group mode)',
      `song_id` int(11) NOT NULL DEFAULT '0' COMMENT 'song_list.ID currently broadcast (0 = nothing)',
      `verse_idx` int(11) NOT NULL DEFAULT '-1' COMMENT 'Verse index from the leader verse mode (-1 = whole song)',
      `langs` varchar(255) NOT NULL DEFAULT '' COMMENT 'Language codes selected by the leader, comma-separated (observer fallback)',
      `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`groupId`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8";
    if (!mysqli_query($ii, $sql)) {
        fwrite(STDERR, "query failed: " . mysqli_error($ii) . "\n");
        exit(1);
    }
    echo "MIGRATED, table current_observer created\n";
}
