<?php
/**
 * One-shot runner for add_song_image_groups.sql using the app's own DB config
 * (the mysql CLI on the server fails with "Malformed packet", PHP/mysqli
 * connects fine — same way app/Database.php does).
 *
 * Run on the server: php database/migrations/run_add_song_image_groups.php
 * Safe to re-run: CREATE TABLE IF NOT EXISTS + defaults are seeded only for
 * collections that have no groups yet.
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

$queries = [
    "CREATE TABLE IF NOT EXISTS `song_image_groups` (
      `ID` int(11) NOT NULL AUTO_INCREMENT,
      `LISTID` int(11) NOT NULL COMMENT 'list_names.LIST_ID',
      `NAME` varchar(255) NOT NULL,
      `SORT_ORDER` int(11) NOT NULL DEFAULT '0',
      `IS_MAIN` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = page 1 is the legacy main sheet /images/<list>/<num>.jpg',
      PRIMARY KEY (`ID`),
      KEY `idx_song_image_groups_list` (`LISTID`,`SORT_ORDER`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

    "CREATE TEMPORARY TABLE `tmp_unseeded_lists` AS
      SELECT n.LIST_ID FROM `list_names` n
      WHERE NOT EXISTS (SELECT 1 FROM `song_image_groups` g WHERE g.LISTID = n.LIST_ID)",

    "INSERT INTO `song_image_groups` (`LISTID`, `NAME`, `SORT_ORDER`, `IS_MAIN`)
      SELECT LIST_ID, 'НОТЫ', 1, 1 FROM `tmp_unseeded_lists`",

    "INSERT INTO `song_image_groups` (`LISTID`, `NAME`, `SORT_ORDER`, `IS_MAIN`)
      SELECT LIST_ID, 'АККОРДЫ', 2, 0 FROM `tmp_unseeded_lists`",

    "DROP TEMPORARY TABLE `tmp_unseeded_lists`",
];

foreach ($queries as $sql) {
    if (!mysqli_query($ii, $sql)) {
        fwrite(STDERR, "query failed: " . mysqli_error($ii) . "\n");
        exit(1);
    }
}

$res = mysqli_query($ii, "SELECT g.ID, g.LISTID, n.LIST_NAME, g.NAME, g.SORT_ORDER, g.IS_MAIN
                          FROM song_image_groups g LEFT JOIN list_names n ON n.LIST_ID = g.LISTID
                          ORDER BY g.LISTID, g.SORT_ORDER, g.ID");
$count = 0;
while ($r = mysqli_fetch_assoc($res)) {
    $count++;
    echo "  #{$r['ID']} list {$r['LISTID']} ({$r['LIST_NAME']}): {$r['NAME']} order={$r['SORT_ORDER']} main={$r['IS_MAIN']}\n";
}
echo "MIGRATED, song_image_groups rows: {$count}\n";
