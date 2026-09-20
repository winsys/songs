-- Streaming display: upper bound for the auto-fit font size, the counterpart
-- of user_settings.main_font_max_size for the main screen. September 2026.
ALTER TABLE `user_settings`
  ADD COLUMN `streaming_font_max_size` tinyint(3) unsigned NOT NULL DEFAULT '64'
  COMMENT 'Max auto-fit font size px for streaming text display (20-200)'
  AFTER `streaming_height_percent`;
