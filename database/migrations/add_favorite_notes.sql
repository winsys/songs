-- Leader notes in the group playlist (September 2026): free text the leader
-- keeps between the songs of the service. A note is a `favorites` row with
-- NOTE set and a synthetic SONGID ('N' + 14 hex chars). The application adds
-- the column by itself on first use (Ajax_Common::ensureFavoriteNotes); this
-- file documents the DDL and allows applying it by hand.
--
-- Rollback (removes all notes):
--   DELETE FROM `favorites` WHERE `NOTE` IS NOT NULL;
--   ALTER TABLE `favorites` DROP COLUMN `NOTE`;

ALTER TABLE `favorites`
  ADD COLUMN `NOTE` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
  COMMENT 'Leader note text; NULL = song row';
