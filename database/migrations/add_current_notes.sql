-- Migration: dedicated musician-notes state table ("notes channel"), Aug 2026.
-- The musician page previously read the sheet-music image from `current.image`,
-- which every screen command rewrites (DELETE + INSERT), so unrelated events
-- kept switching the musicians' notes off. Notes now live in their own table
-- and are only changed by the leader's / technician's explicit notes toggles.
--
-- Reverse: DROP TABLE `current_notes`;

CREATE TABLE IF NOT EXISTS `current_notes` (
  `groupId` int(11) NOT NULL,
  `image` varchar(2000) NOT NULL DEFAULT '',
  PRIMARY KEY (`groupId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Seed from `current`: groups whose row still carries a sheet-music image
-- ('/images/<listId>/<num>.jpg') keep their notes across the deploy.
INSERT IGNORE INTO `current_notes` (`groupId`, `image`)
SELECT `groupId`, `image` FROM `current`
WHERE `groupId` IS NOT NULL
  AND `image` REGEXP '^/images/[0-9]+/[^/]+\\.jpg$';
