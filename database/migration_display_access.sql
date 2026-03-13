-- Migration: Display Access Requests
-- This table stores access requests from preachers to display their sermons on other groups' displays

CREATE TABLE IF NOT EXISTS `display_access_requests` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `requester_group_id` int(11) NOT NULL COMMENT 'Group ID of the requester (preacher)',
    `target_group_id` int(11) NOT NULL COMMENT 'Group ID of the target display owner',
    `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    `requested_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `responded_at` timestamp NULL DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `unique_request` (`requester_group_id`, `target_group_id`),
    KEY `idx_target_pending` (`target_group_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Stores display access requests between groups';
