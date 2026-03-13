<?php

define('RUNNING_MIGRATION', true);

// Подключаем зависимости (пути от корня проекта)
require_once __DIR__ . '/../app/Info.php';
require_once __DIR__ . '/../app/Database.php';
require_once __DIR__ . '/../app/Security.php';

Info::set('config', include __DIR__ . '/../app/config_example.php');

$database = new Database();
Info::set('db', $database);
Info::set('dbh', $database->db_handle());

$db  = Info::get('db');
$dbh = Info::get('dbh');

echo "=== Миграция паролей ===\n";

// Проверяем ключ шифрования
$conf = Info::get('config');
if (empty($conf['encryption_key']) || $conf['encryption_key'] === 'ЗАМЕНИТЕ_НА_СЛУЧАЙНЫЙ_КЛЮЧ_32_БАЙТА_base64==') {
    die("❌ ОШИБКА: Сначала задайте encryption_key в app/config_example.php!\n"
        . "   Команда для генерации ключа:\n"
        . "   php -r \"echo base64_encode(random_bytes(32));\" \n");
}

$users = $db->select("SELECT ID, PASS FROM users");
$migrated = 0;
$skipped  = 0;

foreach ($users as $user) {
    $id   = (int)$user['ID'];
    $pass = $user['PASS'];

    // Пропускаем уже зашифрованные
    if (strncmp($pass, 'enc:', 4) === 0) {
        echo "  [пропуск] ID={$id} — уже зашифрован\n";
        $skipped++;
        continue;
    }

    // Шифруем
    try {
        $encrypted = Security::encryptPassword($pass);
    } catch (Exception $e) {
        echo "  [ошибка]  ID={$id} — {$e->getMessage()}\n";
        continue;
    }

    $escapedEnc = mysqli_real_escape_string($dbh, $encrypted);
    $db->exec("UPDATE users SET PASS='{$escapedEnc}' WHERE ID={$id}");
    echo "  [✓]       ID={$id} — пароль зашифрован\n";
    $migrated++;
}

echo "\n=== Готово: зашифровано {$migrated}, пропущено {$skipped} ===\n";
