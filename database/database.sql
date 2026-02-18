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
