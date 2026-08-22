-- Migration: multilingual names for sheet-music image groups, August 2026.
-- NAMES = JSON object {ui_lang: name} for the UI languages (ru/de/en/lt);
-- a missing or empty entry falls back to NAME (the name the group was
-- created with). The default groups get their translations here.
--
-- Reverse: ALTER TABLE `song_image_groups` DROP COLUMN `NAMES`;

ALTER TABLE `song_image_groups`
  ADD COLUMN `NAMES` text NULL COMMENT 'JSON {ui_lang: name}; missing entry falls back to NAME'
  AFTER `NAME`;

-- Translate the default groups (only rows still carrying the default names).
UPDATE `song_image_groups`
   SET `NAMES` = '{"ru":"НОТЫ","de":"NOTEN","en":"SHEET MUSIC","lt":"NATOS"}'
 WHERE `NAME` = 'НОТЫ' AND (`NAMES` IS NULL OR `NAMES` = '');
UPDATE `song_image_groups`
   SET `NAMES` = '{"ru":"АККОРДЫ","de":"AKKORDE","en":"CHORDS","lt":"AKORDAI"}'
 WHERE `NAME` = 'АККОРДЫ' AND (`NAMES` IS NULL OR `NAMES` = '');
