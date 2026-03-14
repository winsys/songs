-- Migration: Rename user_settings.user_id to group_id
-- This field actually contains GROUP_ID, not user ID, so we're renaming it for clarity

-- Step 1: Drop the foreign key constraint (it references wrong column anyway)
ALTER TABLE `user_settings` DROP FOREIGN KEY `fk_user_settings_user`;

-- Step 2: Rename the column
ALTER TABLE `user_settings` CHANGE COLUMN `user_id` `group_id` INT(11) NOT NULL;

-- Step 3: Add correct foreign key constraint (references users.GROUP_ID)
-- Note: We cannot add FK to GROUP_ID because it's not unique in users table
-- Each group can have multiple users, so we'll just leave it without FK
-- This is intentional as group_id represents a group, not a specific user

-- Step 4: Update primary key name (optional, for consistency)
ALTER TABLE `user_settings` DROP PRIMARY KEY, ADD PRIMARY KEY (`group_id`);
