-- Leader's split-screen verse mode: allow selecting several languages at once
-- (0 = language buttons act as a radio switch, 1 = toggles). August 2026.
ALTER TABLE `user_settings`
  ADD COLUMN `leader_text_multilang` tinyint(1) NOT NULL DEFAULT '0'
  COMMENT 'Leader verse mode: 1 = several languages selectable at once'
  AFTER `ui_lang`;
