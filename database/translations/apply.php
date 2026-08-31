<?php
/**
 * Apply a generated Bible translation file (database/translations/*.sql)
 * to the database through the app's own DB config — the same mysqli
 * connect as database/migrations/run_*.php (the server's mysql CLI fails
 * with "Malformed packet"; mysqli connects fine).
 *
 * Run on the server (file name relative to this directory or any path):
 *   php database/translations/apply.php lithuanian.sql
 *   php database/translations/apply.php --check lithuanian.sql   # parse only, no DB
 *
 * The file is split into statements on ';' outside quoted strings (verse
 * text is full of semicolons) and the statements run one by one in the
 * order written. The generated files open their own START TRANSACTION …
 * COMMIT, so an error in the middle rolls the whole import back and a
 * half-imported translation never stays behind. The translation list
 * (with book and verse counts) is printed before and after so a swap can
 * be verified at a glance.
 */

$check = false;
$file  = null;
foreach (array_slice($argv, 1) as $a) {
    if ($a === '--check') { $check = true; continue; }
    $file = $a;
}
if ($file === null) {
    fwrite(STDERR, "usage: php apply.php [--check] <translation.sql>\n");
    exit(2);
}
if (!is_file($file) && is_file(__DIR__ . '/' . $file)) {
    $file = __DIR__ . '/' . $file;
}
if (!is_file($file)) {
    fwrite(STDERR, "not found: {$file}\n");
    exit(2);
}

$sql        = file_get_contents($file);
$statements = splitStatements($sql);
$summary    = summarize($statements);

echo "File: " . realpath($file) . "\n";
echo "Statements: " . count($statements)
   . " (books: {$summary['books']}, verse rows: {$summary['verses']}, verse INSERTs: {$summary['verse_stmts']})\n";
foreach ($summary['head'] as $st) {
    echo "  " . $st . "\n";
}
if ($summary['verses'] === 0 || $summary['books'] === 0) {
    fwrite(STDERR, "refusing: the file inserts no books/verses\n");
    exit(1);
}
if ($check) {
    echo "--check: parsed only, nothing executed.\n";
    exit(0);
}

$conf = include __DIR__ . '/../../app/config.php';
$db   = $conf['db'];

$ii = mysqli_init();
mysqli_options($ii, MYSQLI_READ_DEFAULT_FILE, '/etc/mysql/mysql.conf.d/mysqld.cnf');
if (!mysqli_real_connect($ii, $db['host'], $db['login'], $db['pass'], $db['database'], (int)$db['port'])) {
    fwrite(STDERR, "connect failed: " . mysqli_connect_error() . "\n");
    exit(1);
}
mysqli_set_charset($ii, 'utf8mb4');

echo "\nTranslations BEFORE:\n";
listTranslations($ii);

$t0 = microtime(true);
foreach ($statements as $n => $stmt) {
    if (!mysqli_query($ii, $stmt)) {
        fwrite(STDERR, "statement #" . ($n + 1) . " failed: " . mysqli_error($ii) . "\n"
            . substr($stmt, 0, 200) . "\n");
        mysqli_query($ii, 'ROLLBACK');
        fwrite(STDERR, "rolled back, database unchanged\n");
        exit(1);
    }
}
printf("\nApplied %d statements in %.1f s\n", count($statements), microtime(true) - $t0);

echo "\nTranslations AFTER:\n";
listTranslations($ii);
mysqli_close($ii);

/**
 * Split SQL text into statements on ';' outside single-quoted strings.
 * Handles the two escapes the generator emits ('' and \x) and drops
 * "-- …" comment lines outside strings. Byte-wise scanning is safe for
 * UTF-8: continuation bytes never equal the quote, backslash or semicolon.
 */
function splitStatements($sql)
{
    $out   = [];
    $buf   = '';
    $len   = strlen($sql);
    $inStr = false;
    for ($i = 0; $i < $len; $i++) {
        $ch = $sql[$i];
        if ($inStr) {
            $buf .= $ch;
            if ($ch === '\\') {
                // Backslash escape: copy the escaped byte verbatim.
                if ($i + 1 < $len) { $buf .= $sql[++$i]; }
            } elseif ($ch === "'") {
                if ($i + 1 < $len && $sql[$i + 1] === "'") { $buf .= "'"; $i++; }  // doubled quote
                else { $inStr = false; }
            }
            continue;
        }
        if ($ch === '-' && $i + 1 < $len && $sql[$i + 1] === '-' && ($i === 0 || $sql[$i - 1] === "\n")) {
            // Comment line (column 0): skip to the end of the line.
            $nl = strpos($sql, "\n", $i);
            if ($nl === false) { break; }
            $i = $nl;
            continue;
        }
        if ($ch === "'") { $inStr = true; $buf .= $ch; continue; }
        if ($ch === ';') {
            $stmt = trim($buf);
            if ($stmt !== '') { $out[] = $stmt; }
            $buf = '';
            continue;
        }
        $buf .= $ch;
    }
    $stmt = trim($buf);
    if ($stmt !== '') { $out[] = $stmt; }
    return $out;
}

/** Counts of what the file inserts plus the leading non-bulk statements for display. */
function summarize(array $statements)
{
    $books = 0; $verses = 0; $verseStmts = 0; $head = [];
    foreach ($statements as $st) {
        if (strpos($st, 'INSERT INTO bible_verses') === 0) {
            $verseStmts++;
            $verses += substr_count($st, '(@b');
        } elseif (strpos($st, 'INSERT INTO bible_books') === 0) {
            $books++;
        } elseif (strpos($st, 'SET @b') === 0) {
            // book id capture — noise
        } else {
            $head[] = strlen($st) > 120 ? substr($st, 0, 117) . '...' : $st;
        }
    }
    return ['books' => $books, 'verses' => $verses, 'verse_stmts' => $verseStmts, 'head' => $head];
}

/** Print every translation with its book and verse counts. */
function listTranslations($ii)
{
    $res = mysqli_query($ii,
        "SELECT t.ID, t.NAME, t.LANG, t.SORT_ORDER,
                COUNT(DISTINCT b.ID) AS books, COUNT(v.ID) AS verses
           FROM bible_translations t
           LEFT JOIN bible_books  b ON b.TRANSLATION_ID = t.ID
           LEFT JOIN bible_verses v ON v.BOOK_ID = b.ID
          GROUP BY t.ID
          ORDER BY t.SORT_ORDER, t.ID");
    if (!$res) {
        fwrite(STDERR, "query failed: " . mysqli_error($ii) . "\n");
        return;
    }
    while ($r = mysqli_fetch_assoc($res)) {
        printf("  %3d  %-34s %-3s sort=%-3d books=%2d verses=%d\n",
            $r['ID'], $r['NAME'], $r['LANG'], $r['SORT_ORDER'], $r['books'], $r['verses']);
    }
}
