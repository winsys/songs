<?php
/**
 * One-shot runner for add_current_notes.sql using the app's own DB config
 * (the mysql CLI on the server fails with "Malformed packet", PHP/mysqli
 * connects fine — same way app/Database.php does).
 *
 * Run on the server: php database/migrations/run_add_current_notes.php
 * Safe to re-run: CREATE TABLE IF NOT EXISTS + INSERT IGNORE.
 */

$conf = include __DIR__ . '/../../app/config.php';
$db   = $conf['db'];

$ii = mysqli_init();
mysqli_options($ii, MYSQLI_READ_DEFAULT_FILE, '/etc/mysql/mysql.conf.d/mysqld.cnf');
if (!mysqli_real_connect($ii, $db['host'], $db['login'], $db['pass'], $db['database'], (int)$db['port'])) {
    fwrite(STDERR, "connect failed: " . mysqli_connect_error() . "\n");
    exit(1);
}

$sql1 = "CREATE TABLE IF NOT EXISTS `current_notes` (
  `groupId` int(11) NOT NULL,
  `image` varchar(2000) NOT NULL DEFAULT '',
  PRIMARY KEY (`groupId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8";

// Seed: groups whose current row still carries a sheet-music image keep
// their notes across the deploy.
$sql2 = "INSERT IGNORE INTO `current_notes` (`groupId`, `image`)
SELECT `groupId`, `image` FROM `current`
WHERE `groupId` IS NOT NULL
  AND `image` REGEXP '^/images/[0-9]+/[^/]+\\\\.jpg$'";

foreach ([$sql1, $sql2] as $sql) {
    if (!mysqli_query($ii, $sql)) {
        fwrite(STDERR, "query failed: " . mysqli_error($ii) . "\n");
        exit(1);
    }
}

$res = mysqli_query($ii, "SELECT COUNT(*) AS c FROM current_notes");
$row = mysqli_fetch_assoc($res);
echo "MIGRATED, current_notes rows: {$row['c']}\n";
$res2 = mysqli_query($ii, "SELECT groupId, image FROM current_notes");
while ($r = mysqli_fetch_assoc($res2)) {
    echo "  {$r['groupId']} {$r['image']}\n";
}
