-- Migration: per-preacher sermon ownership
-- Adds sermons.OWNER_USER_ID (FK users.ID) so a sermon is owned by a specific
-- user account, replacing the fragile AUTHOR_GOOGLE_ID-based ownership.
--
-- Ownership model after this migration:
--   * sermons.USER_ID       = group / tenant scope (unchanged)
--   * sermons.OWNER_USER_ID = the user account that owns the sermon
--   * AUTHOR_GOOGLE_ID       = kept for history only, no longer used for access control
--
-- Visibility rule enforced in PHP (app/Ajax_Sermon.php):
--   * admin    -> all sermons of their group
--   * preacher -> only sermons where OWNER_USER_ID = their own user id
--
-- Date: 2026-05-31

ALTER TABLE `sermons`
  ADD COLUMN `OWNER_USER_ID` int(11) DEFAULT NULL COMMENT 'User account that owns this sermon' AFTER `USER_ID`,
  ADD KEY `idx_sermons_owner` (`OWNER_USER_ID`);

-- Backfill from the multi-account table: map the recorded author Google id to a user.
UPDATE `sermons` s
  JOIN `user_google_accounts` g ON g.google_id = s.AUTHOR_GOOGLE_ID
  SET s.OWNER_USER_ID = g.user_id
  WHERE s.AUTHOR_GOOGLE_ID IS NOT NULL;

-- Backfill fallback from the legacy users.GOOGLE_ID column.
UPDATE `sermons` s
  JOIN `users` u ON u.GOOGLE_ID = s.AUTHOR_GOOGLE_ID AND u.GOOGLE_ID <> ''
  SET s.OWNER_USER_ID = u.ID
  WHERE s.AUTHOR_GOOGLE_ID IS NOT NULL AND s.OWNER_USER_ID IS NULL;

-- Sermons with no recorded author (AUTHOR_GOOGLE_ID IS NULL) keep OWNER_USER_ID = NULL.
-- They remain visible to the group admin only until reassigned manually.
