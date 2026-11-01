<?php
/**
 * One-off (2026-11-01): renumber the live «Гусли» collection in place to the
 * Latin "g" NUM of gusli.json (001 → g001, 084а / 084б → g084a / g084b,
 * д001 → g511) and insert the songs gusli.json has and the collection lacks
 * (№508-510 of the 1927 notes).
 *
 * song_list.ID never changes (playlists point to it): each row gets UPDATE
 * NUM, its sheet files (main group + the other groups) are renamed with it;
 * new songs are INSERTed alone, their sheets copied from --images <dir>
 * (<dir>/g508.jpg …, e.g. a copy of the local gusli_notes/). A renamed sheet
 * that a screen or the musicians show right now (current / current_notes) is
 * pointed at its new name. Re-runnable: rows already in the "g" format are
 * skipped.
 *
 *   php database/collections/gusli/renumber_prod.php [--images <dir>]          # dry run
 *   php database/collections/gusli/renumber_prod.php --apply --images <dir>
 */

$apply  = false;
$images = null;
$args   = array_slice($argv, 1);
for ($i = 0; $i < count($args); $i++) {
    if ($args[$i] === '--apply') { $apply = true; continue; }
    if ($args[$i] === '--images') { $images = $args[++$i] ?? null; continue; }
    fwrite(STDERR, "usage: php renumber_prod.php [--apply] [--images <dir>]\n");
    exit(2);
}

chdir(__DIR__ . '/../../../public');
include '../app/Info.php';
include '../app/Database.php';
include '../app/SongImages.php';
Info::set('config', include '../app/config.php');
$db  = new Database();
$dbh = $db->db_handle();

function fail($msg)
{
    fwrite(STDERR, "FAIL: {$msg}\n");
    exit(1);
}

/** NUM of the first upload -> NUM of gusli.json (database/collections/gusli/nums.py). */
function newNum($old)
{
    if ($old === 'д001') return 'g511';
    if (!preg_match('/^(\d{3})(а|б)?$/u', $old, $m)) return null;
    $suffix = isset($m[2]) ? ($m[2] === 'а' ? 'a' : 'b') : '';
    return 'g' . $m[1] . $suffix;
}

$json = json_decode(file_get_contents(__DIR__ . '/../gusli.json'), true);
$byNum = [];
foreach ($json['songs'] as $s) $byNum[$s['num']] = $s;
$L = (int)$db->getValue("SELECT LIST_ID FROM list_names WHERE LIST_NAME = 'Гусли'");
if ($L <= 0) fail('no collection «Гусли»');
$dirs = ['main' => SongImages::listDir($L)];
foreach ($db->select("SELECT ID FROM song_image_groups WHERE LISTID = {$L} AND IS_MAIN = 0") as $g) {
    $dirs['g' . $g['ID']] = SongImages::groupDir($L, $g['ID']);
}
echo ($apply ? 'APPLY' : 'DRY RUN') . ": LIST_ID {$L}, gusli.json " . count($byNum) . " songs, image dirs "
    . implode(', ', array_keys($dirs)) . "\n";

// 1. Plan and checks — nothing is changed when any check fails.
$rows = $db->select("SELECT ID, NUM, NAME FROM song_list WHERE LISTID = {$L} ORDER BY ID");
$plan = [];
$have = [];
foreach ($rows as $r) {
    $old = $r['NUM'];
    if (preg_match('/^g\d{3}[ab]?$/', $old)) {
        $have[$old] = true;
        continue;
    }
    $new = newNum($old);
    if ($new === null) fail("no new NUM for ID {$r['ID']} «{$old}»");
    if (!isset($byNum[$new])) fail("{$new} is not in gusli.json");
    if ($byNum[$new]['name'] !== $r['NAME']) fail("{$old} -> {$new}: name «{$r['NAME']}» ≠ «{$byNum[$new]['name']}»");
    foreach ($dirs as $d) {
        if (file_exists("{$d}/{$new}.jpg")) fail("{$d}/{$new}.jpg exists already");
    }
    $plan[] = [(int)$r['ID'], $old, $new];
    $have[$new] = true;
}
$insert = array_values(array_diff(array_keys($byNum), array_keys($have)));
foreach ($insert as $num) {
    if ($images === null || !is_file("{$images}/{$num}.jpg")) echo "   note: no sheet for {$num} (--images)\n";
}
echo count($rows) . " rows: renumber " . count($plan) . ", insert " . json_encode($insert) . "\n";
foreach ($plan as $p) {
    if (!preg_match('/^\d{3}$/', $p[1]) || $p[1] === '001') echo "   ID {$p[0]}: {$p[1]} -> {$p[2]}\n";
}
$ref = null;
foreach (glob($dirs['main'] . '/*.jpg') as $f) { $ref = stat($f); break; }

// Screens and musicians showing a sheet that is renamed: [table, old path, new path].
$map = [];
foreach ($plan as $p) $map[$p[1]] = $p[2];
$shown = [];
foreach (['current', 'current_notes'] as $t) {
    foreach ($db->select("SELECT DISTINCT image FROM {$t} WHERE image LIKE '/images/{$L}/%'") as $r) {
        if (preg_match('#^/images/' . $L . '/(g\d+/)?([^/?]+)\.jpg(\?.*)?$#u', $r['image'], $m) && isset($map[$m[2]])) {
            $shown[] = [$t, $r['image'], "/images/{$L}/{$m[1]}{$map[$m[2]]}.jpg" . (isset($m[3]) ? $m[3] : '')];
        }
    }
}
foreach ($shown as $s) echo "   shown in {$s[0]}: {$s[1]} -> {$s[2]}\n";
if (!$apply) exit(0);

// 2. Renumber: the files of the row first, then the row itself.
$renamed = array_fill_keys(array_keys($dirs), 0);
foreach ($plan as list($id, $old, $new)) {
    foreach ($dirs as $k => $d) {
        if (is_file("{$d}/{$old}.jpg")) {
            if (!rename("{$d}/{$old}.jpg", "{$d}/{$new}.jpg")) fail("rename {$d}/{$old}.jpg");
            $renamed[$k]++;
        }
    }
    $n = mysqli_real_escape_string($dbh, $new);
    if (!mysqli_query($dbh, "UPDATE song_list SET NUM = '{$n}' WHERE ID = {$id} AND LISTID = {$L}")) {
        fail("update ID {$id}: " . mysqli_error($dbh));
    }
}
echo "renumbered " . count($plan) . " rows, renamed files " . json_encode($renamed) . "\n";
foreach ($shown as list($t, $old, $new)) {
    $o = mysqli_real_escape_string($dbh, $old);
    $n = mysqli_real_escape_string($dbh, $new);
    if (!mysqli_query($dbh, "UPDATE {$t} SET image = '{$n}' WHERE image = '{$o}'")) fail("update {$t}: " . mysqli_error($dbh));
    echo "{$t}: {$old} -> {$new}\n";
}

// 3. New songs: one INSERT each (existing rows untouched) + the main sheet.
foreach ($insert as $num) {
    $s = $byNum[$num];
    $sql = sprintf("INSERT INTO song_list (LISTID, NUM, NAME, TEXT) VALUES (%d, '%s', '%s', '%s')", $L,
        mysqli_real_escape_string($dbh, $num), mysqli_real_escape_string($dbh, $s['name']),
        mysqli_real_escape_string($dbh, $s['texts']['ru']));
    if (!mysqli_query($dbh, $sql)) fail("insert {$num}: " . mysqli_error($dbh));
    echo "inserted {$num} «{$s['name']}» as ID " . mysqli_insert_id($dbh);
    if ($images !== null && is_file("{$images}/{$num}.jpg")) {
        $dst = $dirs['main'] . "/{$num}.jpg";
        if (!copy("{$images}/{$num}.jpg", $dst)) fail("copy {$num}.jpg");
        if ($ref) {
            @chown($dst, $ref['uid']);
            @chgrp($dst, $ref['gid']);
            @chmod($dst, $ref['mode'] & 0777);
        }
        echo " + sheet";
    }
    echo "\n";
}

// 4. Verify.
$nums = array_column($db->select("SELECT NUM FROM song_list WHERE LISTID = {$L} ORDER BY NUM"), 'NUM');
$numSet = array_flip($nums);
$bad = array_values(array_filter($nums, function ($n) { return !preg_match('/^g\d{3}[ab]?$/', $n); }));
$noSheet = array_values(array_filter($nums, function ($n) use ($dirs) { return !is_file($dirs['main'] . "/{$n}.jpg"); }));
$orphans = [];
$counts = [];
foreach ($dirs as $k => $d) {
    $counts[$k] = 0;
    foreach (is_dir($d) ? scandir($d) : [] as $f) {
        if (!preg_match('/^(.+)\.(jpg|png)$/i', $f, $m)) continue;
        $counts[$k]++;
        if (!isset($numSet[$m[1]])) $orphans[] = "{$k}/{$f}";
    }
}
echo count($nums) . " rows; NUM not in the g format: " . json_encode($bad, JSON_UNESCAPED_UNICODE)
    . "; without a main sheet: " . json_encode($noSheet) . "; files without a song: "
    . json_encode($orphans, JSON_UNESCAPED_UNICODE) . "; files " . json_encode($counts) . "\n";
echo "list order: " . implode(' ', array_slice($nums, 0, 3)) . ' … ' . implode(' ', array_slice($nums, 82, 4))
    . ' … ' . implode(' ', array_slice($nums, -4)) . "\n";
$search = array_column($db->select("SELECT NUM FROM song_list WHERE LISTID = {$L} ORDER BY LISTID, NUM+0, NUM"), 'NUM');
echo "search order (get_songs_for_search): " . ($search === $nums ? 'same' : 'DIFFERENT') . "\n";
