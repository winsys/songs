-- Observer mode (August 2026): a new role `observer` (shared per-group account
-- for any church member: search/view songs, Bible, messages; passive "group
-- mode" that follows the leader) and the OBSERVER CHANNEL — one row per
-- group with what the leader currently broadcasts to observers. Completely
-- separate from `current` (screens) and `current_notes` (musicians).
--
-- Rollback:
--   DROP TABLE `current_observer`;
--   ALTER TABLE `users` MODIFY `ROLE` enum('admin','leader','musician','preacher','tech','screen') NOT NULL DEFAULT 'musician';
--   (delete users with ROLE='observer' before narrowing the enum)

ALTER TABLE `users`
  MODIFY `ROLE` enum('admin','leader','musician','preacher','tech','screen','observer') NOT NULL DEFAULT 'musician';

CREATE TABLE IF NOT EXISTS `current_observer` (
  `groupId` int(11) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = the leader broadcasts to observers (group mode)',
  `song_id` int(11) NOT NULL DEFAULT '0' COMMENT 'song_list.ID currently broadcast (0 = nothing)',
  `verse_idx` int(11) NOT NULL DEFAULT '-1' COMMENT 'Verse index from the leader verse mode (-1 = whole song)',
  `langs` varchar(255) NOT NULL DEFAULT '' COMMENT 'Language codes selected by the leader, comma-separated (observer fallback)',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`groupId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
