-- Migration: add UI language preference column to user_settings
-- Run once on the live database before deploying the i18n feature.
-- Allowed values handled in PHP: 'ru' (default), 'de', 'en'.

ALTER TABLE `user_settings`
    ADD COLUMN `ui_lang` VARCHAR(5) NOT NULL DEFAULT 'ru'
        COMMENT 'UI language code (ru/de/en). Independent from content languages.';
