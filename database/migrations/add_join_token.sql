-- Observer auto-login link / QR code (August 2026): a per-user random
-- secret carried ONLY by observer accounts. /join/<token> logs the device in
-- as that account and opens /observer. Regenerating the token on the
-- settings page invalidates every old link / QR code.
--
-- Rollback:
--   ALTER TABLE `users` DROP INDEX `idx_join_token`, DROP COLUMN `JOIN_TOKEN`;

ALTER TABLE `users`
  ADD COLUMN `JOIN_TOKEN` varchar(64) DEFAULT NULL
  COMMENT 'Auto-login token for the /join/<token> link (observer accounts only); NULL = no link issued'
  AFTER `GROUP_ID`,
  ADD UNIQUE KEY `idx_join_token` (`JOIN_TOKEN`);
