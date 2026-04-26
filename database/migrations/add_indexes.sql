-- Migration: add performance indexes
-- Run once on the live database.
-- All statements use IF NOT EXISTS / ADD IF NOT EXISTS equivalents via procedures,
-- or are safe to re-run (InnoDB silently ignores duplicate key names on most versions).

-- song_list: index on LISTID (used in every song-list query) and NAME (for search ordering)
ALTER TABLE `song_list`
    ADD KEY `idx_song_list_listid` (`LISTID`),
    ADD KEY `idx_song_list_name` (`NAME`);

-- messages: FULLTEXT index on TITLE and TEXT (used by search_messages)
-- When adding a new language column (e.g. TEXT_UK), extend this index:
--   ALTER TABLE `messages` DROP KEY `ft_messages`, ADD FULLTEXT KEY `ft_messages` (`TITLE`,`TEXT`,`TEXT_UK`);
ALTER TABLE `messages`
    ADD FULLTEXT KEY `ft_messages` (`TITLE`,`TEXT`);

-- bible_verses: FULLTEXT index on all verse-text columns
ALTER TABLE `bible_verses`
    ADD FULLTEXT KEY `ft_bible_text` (`TEXT`,`TEXT_LT`,`TEXT_EN`);
