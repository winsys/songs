-- Migration: add German book/verse columns to the Bible tables
-- Required before importing Lutherbibel 1912 / Elberfelder 1905.
-- Safe to run multiple times: ALTER … ADD COLUMN IF NOT EXISTS not supported in MySQL 5.7,
-- so wrap in a stored procedure or check manually before re-running.

ALTER TABLE `bible_books`
    ADD COLUMN `NAME_DE` VARCHAR(255) DEFAULT NULL COMMENT 'Book name (DE)';

ALTER TABLE `bible_verses`
    ADD COLUMN `TEXT_DE` TEXT DEFAULT NULL COMMENT 'Verse text (DE)';

-- Rebuild the FULLTEXT index to include the new TEXT_DE column so search
-- in Bible mode finds German verses.
ALTER TABLE `bible_verses` DROP KEY `ft_bible_text`;
ALTER TABLE `bible_verses` ADD FULLTEXT KEY `ft_bible_text` (`TEXT`, `TEXT_LT`, `TEXT_EN`, `TEXT_DE`);
