-- Observer channel, tech console broadcast (August 2026): besides the song
-- (song_id / verse_idx) the channel carries a TEXT OVERLAY — the Bible verse
-- or message paragraph the technician put on the screen. While non-empty it
-- is what observers see; clearing it brings the song (if any) back.
--
-- Rollback:
--   ALTER TABLE `current_observer` DROP COLUMN `text`, DROP COLUMN `title`;

ALTER TABLE `current_observer`
  ADD COLUMN `text` text COMMENT 'Text overlay shown to observers (Bible verse / message paragraph); empty = none' AFTER `langs`,
  ADD COLUMN `title` varchar(255) NOT NULL DEFAULT '' COMMENT 'Caption of the text overlay (Bible reference / message title)' AFTER `text`;
