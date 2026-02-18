-- --------------------------------------------------------
-- Host:                         songs.winsys.lv
-- Server version:               5.7.42-0ubuntu0.18.04.1 - (Ubuntu)
-- Server OS:                    Linux
-- HeidiSQL Version:             12.8.0.6908
-- --------------------------------------------------------

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
    ) ENGINE=InnoDB AUTO_INCREMENT=7329 DEFAULT CHARSET=utf8;

-- Data exporting was unselected.

-- Dumping structure for table songs.list_names
CREATE TABLE IF NOT EXISTS `list_names` (
                                            `LIST_ID` int(11) NOT NULL,
    `LIST_NAME` varchar(255) DEFAULT NULL,
    `ADDEDBY` int(11) DEFAULT NULL,
    PRIMARY KEY (`LIST_ID`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Data exporting was unselected.

-- Dumping structure for table songs.piano_favorites
CREATE TABLE IF NOT EXISTS `piano_favorites` (
                                                 `groupId` int(11) DEFAULT NULL,
    `ID` int(11) NOT NULL AUTO_INCREMENT,
    `SONGID` varchar(15) NOT NULL,
    PRIMARY KEY (`ID`) USING BTREE,
    UNIQUE KEY `Index 1` (`SONGID`) USING BTREE
    ) ENGINE=InnoDB AUTO_INCREMENT=142 DEFAULT CHARSET=utf8 ROW_FORMAT=DYNAMIC;

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
    ) ENGINE=InnoDB AUTO_INCREMENT=3262 DEFAULT CHARSET=utf8;

-- Data exporting was unselected.

-- Dumping structure for table songs.users
CREATE TABLE IF NOT EXISTS `users` (
                                       `ID` int(11) NOT NULL AUTO_INCREMENT,
    `NAME` varchar(64) NOT NULL,
    `LOGIN` varchar(64) NOT NULL,
    `PASS` varchar(128) NOT NULL,
    `LAST_LOGIN` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`ID`)
    ) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8;

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
    PRIMARY KEY (`user_id`),
    CONSTRAINT `fk_user_settings_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`ID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Data exporting was unselected.
