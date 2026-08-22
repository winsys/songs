<?php
/**
 * One-shot runner for add_song_image_group_names.sql using the app's own DB
 * config (the mysql CLI on the server fails with "Malformed packet",
 * PHP/mysqli connects fine — same way app/Database.php does).
 *
 * Run on the server: php database/migrations/run_add_song_image_group_names.php
 * Safe to re-run: the column is added only when missing, the default
 * translations only fill empty NAMES of rows still named НОТЫ / АККОРДЫ.
 */

$conf = include __DIR__ . '/../../app/config.php';
$db   = $conf['db'];

$ii = mysqli_init();
mysqli_options($ii, MYSQLI_READ_DEFAULT_FILE, '/etc/mysql/mysql.conf.d/mysqld.cnf');
if (!mysqli_real_connect($ii, $db['host'], $db['login'], $db['pass'], $db['database'], (int)$db['port'])) {
    fwrite(STDERR, "connect failed: " . mysqli_connect_error() . "\n");
    exit(1);
}
$ii->set_charset('utf8mb4');

$res = mysqli_query($ii, "SHOW COLUMNS FROM `song_image_groups` LIKE 'NAMES'");
if ($res && mysqli_num_rows($res) > 0) {
    echo "column song_image_groups.NAMES already exists\n";
} else {
    $sql = "ALTER TABLE `song_image_groups`
      ADD COLUMN `NAMES` text NULL COMMENT 'JSON {ui_lang: name}; missing entry falls back to NAME'
      AFTER `NAME`";
    if (!mysqli_query($ii, $sql)) {
        fwrite(STDERR, "query failed: " . mysqli_error($ii) . "\n");
        exit(1);
    }
    echo "column song_image_groups.NAMES added\n";
}

$updates = [
    "UPDATE `song_image_groups`
        SET `NAMES` = '{\"ru\":\"НОТЫ\",\"de\":\"NOTEN\",\"en\":\"SHEET MUSIC\",\"lt\":\"NATOS\"}'
      WHERE `NAME` = 'НОТЫ' AND (`NAMES` IS NULL OR `NAMES` = '')",
    "UPDATE `song_image_groups`
        SET `NAMES` = '{\"ru\":\"АККОРДЫ\",\"de\":\"AKKORDE\",\"en\":\"CHORDS\",\"lt\":\"AKORDAI\"}'
      WHERE `NAME` = 'АККОРДЫ' AND (`NAMES` IS NULL OR `NAMES` = '')",
];
foreach ($updates as $sql) {
    if (!mysqli_query($ii, $sql)) {
        fwrite(STDERR, "query failed: " . mysqli_error($ii) . "\n");
        exit(1);
    }
    echo "translated rows: " . mysqli_affected_rows($ii) . "\n";
}

$res = mysqli_query($ii, "SELECT ID, LISTID, NAME, NAMES FROM song_image_groups ORDER BY LISTID, SORT_ORDER");
while ($r = mysqli_fetch_assoc($res)) {
    echo "  #{$r['ID']} list {$r['LISTID']}: {$r['NAME']} -> " . ($r['NAMES'] ?: '(none)') . "\n";
}
echo "MIGRATED\n";
