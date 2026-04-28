-- =====================================================================
-- Migration: drop parallel-language columns from the Bible tables
--
-- After the move to one-translation-per-row architecture every Bible
-- translation lives as its own row in `bible_translations` with its
-- own `bible_books` and `bible_verses` rows. Verse text always goes to
-- `bible_verses.TEXT` and book names to `bible_books.NAME`. The legacy
-- per-row parallel columns (TEXT_LT, TEXT_EN, TEXT_DE, NAME_LT,
-- NAME_EN, NAME_DE) are no longer used by the application.
--
-- ---------------------------------------------------------------------
-- BEFORE RUNNING — verify, in this order:
--
--   1. The new "King James Version" translation has been imported
--      (see database/translations/kjv.sql). Otherwise the English
--      Bible disappears.
--
--   2. Any existing Lithuanian text currently kept in the Synodal
--      translation row's TEXT_LT column has been migrated to its own
--      `bible_translations` row (LANG='lt') with matching books and
--      verses. Otherwise the Lithuanian Bible disappears. If you want
--      to keep the Lithuanian inline text accessible until the
--      standalone import is ready, postpone this migration.
--
--   3. The `current` and `messages` tables are NOT touched by this
--      migration — only `bible_books` and `bible_verses`. The
--      song-list / messages parallel-language columns are a separate
--      story.
--
-- The Ajax layer (app/Ajax_Tech.php, app/Ajax_Common.php) reads the
-- list of language columns dynamically via information_schema, so it
-- transparently degrades after this migration: dynamic SELECTs simply
-- stop appending TEXT_LT / TEXT_EN / TEXT_DE / NAME_xx, and each
-- translation's `supported_langs` collapses to just its primary LANG.
-- The frontend already shows one language at a time and reads the
-- canonical TEXT / NAME columns via fallback, so no client change is
-- strictly required — but verify before running.
--
-- This migration is intentionally NOT idempotent: re-running fails on
-- "Unknown column" once the columns are gone, by design.
-- =====================================================================

START TRANSACTION;

-- 1. Rebuild the FULLTEXT index over TEXT only (must drop before columns
--    referenced by the index are dropped).
ALTER TABLE `bible_verses` DROP KEY `ft_bible_text`;
ALTER TABLE `bible_verses` ADD FULLTEXT KEY `ft_bible_text` (`TEXT`);

-- 2. Drop the parallel-language verse text columns.
ALTER TABLE `bible_verses`
    DROP COLUMN `TEXT_LT`,
    DROP COLUMN `TEXT_EN`,
    DROP COLUMN `TEXT_DE`;

-- 3. Drop the parallel-language book name columns.
ALTER TABLE `bible_books`
    DROP COLUMN `NAME_LT`,
    DROP COLUMN `NAME_EN`,
    DROP COLUMN `NAME_DE`;

COMMIT;
