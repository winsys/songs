-- --------------------------------------------------------
-- Host:                         server.winsys.lv
-- Server version:               5.7.42-0ubuntu0.18.04.1 - (Ubuntu)
-- Server OS:                    Linux
-- HeidiSQL Version:             12.8.0.6908
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

-- Dumping structure for table songs.bible_books
CREATE TABLE IF NOT EXISTS `bible_books` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `TRANSLATION_ID` int(11) NOT NULL,
  `BOOK_NUM` int(11) NOT NULL COMMENT '1-66 canonical book number',
  `NAME` varchar(255) NOT NULL COMMENT 'Book name (RU)',
  `NAME_LT` varchar(255) DEFAULT NULL COMMENT 'Book name (LT)',
  `NAME_EN` varchar(255) DEFAULT NULL COMMENT 'Book name (EN)',
  PRIMARY KEY (`ID`),
  KEY `idx_translation_book` (`TRANSLATION_ID`,`BOOK_NUM`),
  CONSTRAINT `fk_bible_books_translation` FOREIGN KEY (`TRANSLATION_ID`) REFERENCES `bible_translations` (`ID`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=67 DEFAULT CHARSET=utf8;

-- Data exporting was unselected.

-- Dumping structure for table songs.bible_translations
CREATE TABLE IF NOT EXISTS `bible_translations` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `NAME` varchar(255) NOT NULL COMMENT 'Translation name, e.g. RSV, NIV, Синодальный',
  `LANG` varchar(10) DEFAULT 'ru' COMMENT 'Primary language: ru, lt, en',
  `SORT_ORDER` int(11) DEFAULT '0',
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8;

-- Data exporting was unselected.

-- Dumping structure for table songs.bible_verses
CREATE TABLE IF NOT EXISTS `bible_verses` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `BOOK_ID` int(11) NOT NULL,
  `CHAPTER_NUM` int(11) NOT NULL,
  `VERSE_NUM` int(11) NOT NULL,
  `TEXT` text COMMENT 'Verse text (RU)',
  `TEXT_LT` text COMMENT 'Verse text (LT)',
  `TEXT_EN` text COMMENT 'Verse text (EN)',
  PRIMARY KEY (`ID`),
  KEY `idx_book_chapter` (`BOOK_ID`,`CHAPTER_NUM`),
  KEY `idx_book_chapter_verse` (`BOOK_ID`,`CHAPTER_NUM`,`VERSE_NUM`),
  CONSTRAINT `fk_bible_verses_book` FOREIGN KEY (`BOOK_ID`) REFERENCES `bible_books` (`ID`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=31167 DEFAULT CHARSET=utf8;

-- Data exporting was unselected.

-- Dumping structure for table songs.current
CREATE TABLE IF NOT EXISTS `current` (
  `groupId` int(11) DEFAULT NULL,
  `image` varchar(50) NOT NULL,
  `text` text,
  `song_name` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Data exporting was unselected.

-- Dumping structure for table songs.favorites
CREATE TABLE IF NOT EXISTS `favorites` (
  `groupId` int(11) DEFAULT NULL,
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `SONGID` varchar(15) NOT NULL,
  PRIMARY KEY (`ID`),
  UNIQUE KEY `Index 1` (`SONGID`)
) ENGINE=InnoDB AUTO_INCREMENT=7477 DEFAULT CHARSET=utf8;

-- Data exporting was unselected.

-- Dumping structure for table songs.list_names
CREATE TABLE IF NOT EXISTS `list_names` (
  `LIST_ID` int(11) NOT NULL,
  `LIST_NAME` varchar(255) DEFAULT NULL,
  `ADDEDBY` int(11) DEFAULT NULL,
  PRIMARY KEY (`LIST_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Data exporting was unselected.

-- Dumping structure for table songs.messages
CREATE TABLE IF NOT EXISTS `messages` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `USER_ID` int(11) NOT NULL DEFAULT '1',
  `CODE` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `TITLE` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `CITY` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `TEXT` longtext COLLATE utf8mb4_unicode_ci,
  `TEXT_LT` longtext COLLATE utf8mb4_unicode_ci,
  `TEXT_EN` longtext COLLATE utf8mb4_unicode_ci,
  `CREATED_AT` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID`),
  KEY `idx_messages_code` (`CODE`)
) ENGINE=InnoDB AUTO_INCREMENT=665 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table songs.piano_favorites
CREATE TABLE IF NOT EXISTS `piano_favorites` (
  `groupId` int(11) DEFAULT NULL,
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `SONGID` varchar(15) NOT NULL,
  PRIMARY KEY (`ID`) USING BTREE,
  UNIQUE KEY `Index 1` (`SONGID`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=145 DEFAULT CHARSET=utf8 ROW_FORMAT=DYNAMIC;

-- Data exporting was unselected.

-- Dumping structure for table songs.sermons
CREATE TABLE IF NOT EXISTS `sermons` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `USER_ID` int(11) NOT NULL,
  `TITLE` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `SERMON_DATE` date DEFAULT NULL,
  `CONTENT` longtext COLLATE utf8mb4_unicode_ci,
  `CREATED_AT` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `UPDATED_AT` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID`),
  KEY `idx_sermons_user` (`USER_ID`),
  CONSTRAINT `fk_sermons_user` FOREIGN KEY (`USER_ID`) REFERENCES `users` (`ID`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table songs.song_list
CREATE TABLE IF NOT EXISTS `song_list` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `LISTID` int(11) NOT NULL DEFAULT '1',
  `NUM` varchar(255) NOT NULL,
  `NAME` varchar(255) NOT NULL,
  `TEXT` text,
  `TEXT_LT` text,
  `TEXT_EN` text,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=3264 DEFAULT CHARSET=utf8;

-- Data exporting was unselected.

-- Dumping structure for table songs.users
CREATE TABLE IF NOT EXISTS `users` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `NAME` varchar(64) NOT NULL,
  `LOGIN` varchar(64) NOT NULL,
  `PASS` varchar(128) NOT NULL,
  `ROLE` enum('admin','leader','musician','preacher') NOT NULL DEFAULT 'musician',
  `GROUP_ID` int(11) NOT NULL DEFAULT '0',
  `LAST_LOGIN` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8;

-- Data exporting was unselected.

-- Dumping structure for table songs.user_settings
CREATE TABLE IF NOT EXISTS `user_settings` (
  `user_id` int(11) NOT NULL,
  `display_name` varchar(255) DEFAULT NULL,
  `favorites_order` enum('latest_top','latest_bottom') DEFAULT 'latest_bottom',
  `available_lists` varchar(255) DEFAULT NULL,
  `placeholder_image` varchar(255) DEFAULT NULL,
  `main_bg_color` varchar(20) DEFAULT '#000000',
  `main_font` varchar(100) DEFAULT 'Arial',
  `main_font_color` varchar(20) DEFAULT '#FFFFFF',
  `streaming_bg_color` varchar(20) DEFAULT '#000000',
  `streaming_font` varchar(100) DEFAULT 'Arial',
  `streaming_font_color` varchar(20) DEFAULT '#FFFFFF',
  `streaming_height_percent` int(11) DEFAULT '100',
  `sermon_notes_bg_color` varchar(20) NOT NULL DEFAULT '#2b2b2b' COMMENT 'Left panel (notes) background colour',
  `sermon_bible_base_color` varchar(20) NOT NULL DEFAULT '#7ec8f8' COMMENT 'Base (header text) colour for Bible-verse chips',
  `sermon_msg_base_color` varchar(20) NOT NULL DEFAULT '#ce93d8' COMMENT 'Base (header text) colour for Epistle/Message chips',
  `sermon_notes_font_size` tinyint(4) NOT NULL DEFAULT '13',
  `sermon_scale_chips` tinyint(4) NOT NULL DEFAULT '0',
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_user_settings_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`ID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Data exporting was unselected.

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
