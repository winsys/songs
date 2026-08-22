-- Migration: sheet-music image groups per song collection, August 2026.
-- Each collection (list_names) gets an ordered list of image groups; a song
-- can carry any number of page images per group (file-based storage, see
-- app/SongImages.php). Every existing collection is seeded with the two
-- default groups: "НОТЫ" (IS_MAIN = 1: page 1 is the legacy /images/<list>/<num>.jpg)
-- and an empty "АККОРДЫ".
--
-- Reverse: DROP TABLE `song_image_groups`;
--          (page files under public/images/<list>/g<id>/ stay on disk)

CREATE TABLE IF NOT EXISTS `song_image_groups` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `LISTID` int(11) NOT NULL COMMENT 'list_names.LIST_ID',
  `NAME` varchar(255) NOT NULL,
  `SORT_ORDER` int(11) NOT NULL DEFAULT '0',
  `IS_MAIN` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = page 1 is the legacy main sheet /images/<list>/<num>.jpg',
  PRIMARY KEY (`ID`),
  KEY `idx_song_image_groups_list` (`LISTID`,`SORT_ORDER`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed the defaults ONLY for collections that have no groups yet (safe to re-run).
CREATE TEMPORARY TABLE `tmp_unseeded_lists` AS
  SELECT n.LIST_ID FROM `list_names` n
  WHERE NOT EXISTS (SELECT 1 FROM `song_image_groups` g WHERE g.LISTID = n.LIST_ID);

INSERT INTO `song_image_groups` (`LISTID`, `NAME`, `SORT_ORDER`, `IS_MAIN`)
  SELECT LIST_ID, 'НОТЫ', 1, 1 FROM `tmp_unseeded_lists`;
INSERT INTO `song_image_groups` (`LISTID`, `NAME`, `SORT_ORDER`, `IS_MAIN`)
  SELECT LIST_ID, 'АККОРДЫ', 2, 0 FROM `tmp_unseeded_lists`;

DROP TEMPORARY TABLE `tmp_unseeded_lists`;
