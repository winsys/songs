# Migration: Rename user_settings.user_id to group_id

## Проблема
Поле `user_settings.user_id` на самом деле содержит `GROUP_ID` из таблицы `users`, а не ID конкретного пользователя. Это создаёт путаницу и несоответствие между именем поля и его содержимым.

## Решение
Переименовать поле `user_id` в `group_id` для соответствия реальному значению.

## Применение миграции

### 1. Запустить SQL миграцию
```bash
mysql -u your_user -p your_database < database/migration_user_settings_rename.sql
```

Или выполнить вручную в MySQL:
```sql
-- Удалить некорректный foreign key
ALTER TABLE `user_settings` DROP FOREIGN KEY `fk_user_settings_user`;

-- Переименовать колонку
ALTER TABLE `user_settings` CHANGE COLUMN `user_id` `group_id` INT(11) NOT NULL;

-- Обновить primary key
ALTER TABLE `user_settings` DROP PRIMARY KEY, ADD PRIMARY KEY (`group_id`);
```

### 2. Обновлённые файлы
Все изменения уже внесены в код:

**PHP (Backend):**
- ✅ `app/Ajax_Common.php` - обновлены все SQL запросы (3 места)
- ✅ `app/Ajax_Settings.php` - обновлены все SQL запросы (3 места)
- ✅ `app/Ajax_Sermon.php` - обновлены все SQL запросы (7 мест)

**HTML Templates:**
- ✅ `templates/layout.html` - исправлен `WS_GROUP_ID`
- ✅ `templates/text_layout.html` - исправлен `WS_GROUP_ID`
- ✅ `templates/text_layout_streaming.html` - исправлен `WS_GROUP_ID`

**Database:**
- ✅ `database/database.sql` - обновлена схема таблицы
- ✅ `database/migration_user_settings_rename.sql` - создана миграция

### 3. Проверка после миграции
После применения миграции проверьте:
1. Загрузку настроек пользователя (страница Settings)
2. Отображение избранных песен (страница Leader/Musician)
3. Сохранение настроек проповеди (страница Sermon Prep)
4. Запросы доступа к дисплеям (страница Sermon)
5. Отображение уведомлений о запросах (страница Tech)

## Что изменилось

### До миграции:
```sql
CREATE TABLE `user_settings` (
    `user_id` int(11) NOT NULL,
    ...
    PRIMARY KEY (`user_id`),
    CONSTRAINT `fk_user_settings_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`ID`)
);
```

### После миграции:
```sql
CREATE TABLE `user_settings` (
    `group_id` int(11) NOT NULL COMMENT 'GROUP_ID from users table',
    ...
    PRIMARY KEY (`group_id`)
) COMMENT='Settings per group (not per user). group_id matches users.GROUP_ID';
```

## Важно
- Foreign key к `users.ID` был удалён, так как он был некорректным
- `group_id` содержит значение `users.GROUP_ID` (группа пользователей), а не `users.ID` (конкретный пользователь)
- Все пользователи одной группы используют одни настройки
- В сессии `$_SESSION['userId']` на самом деле хранится `GROUP_ID`, а не ID пользователя
- Несуществующая `$_SESSION['groupId']` была заменена на `Security::getUserId()` во всех шаблонах

## Исправленные баги
1. **Text Layout страницы не отображали контент** - использовали несуществующую `$_SESSION['groupId']` вместо `$_SESSION['userId']`
2. **WebSocket не доставлял обновления на дисплеи** - из-за неправильного `WS_GROUP_ID = 0` вместо реального GROUP_ID
3. **Запросы доступа не отображались** - SQL запросы использовали неправильные JOIN'ы с `user_settings`
