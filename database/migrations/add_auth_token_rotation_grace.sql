-- "Remember me" tokens (app/RememberMe.php): race-safe rotation, Sept 2026.
-- The previous validator hash is kept for a grace window after rotation so
-- two simultaneous session-less requests (page + ajax poll, two restored
-- tabs) do not revoke the token. Applied automatically by
-- RememberMe::schemaReady() on first login / auto-login / logout; this file
-- is for a manual run when the app's DB user lacks ALTER.
ALTER TABLE auth_token
  ADD COLUMN prev_validator_hash CHAR(64) NULL DEFAULT NULL AFTER validator_hash,
  ADD COLUMN rotated_at DATETIME NULL DEFAULT NULL AFTER prev_validator_hash;
