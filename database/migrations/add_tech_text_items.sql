-- Scripture / quote items in the tech playlist (November 2026): a Bible
-- passage (one or several languages, composed by the tech console exactly as
-- it goes to the screen) or a paragraph of the Message. They live in
-- `tech_media_favorites` (read by the tech console only — the leader page
-- never sees them) with media_type 'bible' | 'quote'; `text` = screen text,
-- `caption` = screen caption, `name` = playlist label, `src` = source line.
-- The application applies this by itself on first use
-- (Ajax_Common::ensureTechTextItems); this file documents the DDL and allows
-- applying it by hand. Additive and safe on live data.
--
-- Rollback (removes all Scripture / quote items):
--   DELETE FROM tech_media_favorites WHERE media_type IN ('bible', 'quote');
--   ALTER TABLE tech_media_favorites DROP COLUMN `text`, DROP COLUMN `caption`,
--     MODIFY media_type enum('image','video','audio')
--         COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'image';

ALTER TABLE tech_media_favorites
    MODIFY media_type enum('image','video','audio','bible','quote')
        COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'image';

ALTER TABLE tech_media_favorites
    ADD COLUMN `text` mediumtext COLLATE utf8mb4_unicode_ci NULL
        COMMENT 'Screen text of a bible / quote item',
    ADD COLUMN `caption` varchar(500) COLLATE utf8mb4_unicode_ci NULL
        COMMENT 'Screen caption of a bible / quote item';
