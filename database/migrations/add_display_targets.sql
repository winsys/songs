-- Migration: technician-controlled shared display targets
--
-- Two channels, stored per group, set by the technician page and pushed to the
-- leader / sermon pages over WebSocket:
--   * leader_display_target  — where the leader (songs) page broadcasts
--   * sermon_display_target  — where the sermon page broadcasts
-- NULL = "do not broadcast" (default).
--
-- Date: 2026-06-03

ALTER TABLE `user_settings`
  ADD COLUMN `leader_display_target` INT NULL DEFAULT NULL COMMENT 'Leader/songs broadcast target group_id (NULL = none)',
  ADD COLUMN `sermon_display_target` INT NULL DEFAULT NULL COMMENT 'Sermon broadcast target group_id (NULL = none)';
