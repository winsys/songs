-- Migration: table for public "request access" applications (login page).
-- Applications are approved/rejected by the site owner via emailed token links.
-- admin_pass is stored encrypted with the same "enc:" scheme as users.PASS.

CREATE TABLE IF NOT EXISTS `signup_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `token` varchar(64) NOT NULL COMMENT 'Random hex token used in approve/reject email links',
  `city` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `admin_name` varchar(64) NOT NULL,
  `admin_pass` varchar(128) NOT NULL COMMENT 'Encrypted (enc:), inserted into users.PASS as-is on approval',
  `ui_lang` varchar(5) NOT NULL DEFAULT 'en' COMMENT 'Requested UI language (ru/de/en/lt)',
  `comments` text,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `created_user_id` int(11) DEFAULT NULL COMMENT 'users.ID of the admin created on approval',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_token` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
