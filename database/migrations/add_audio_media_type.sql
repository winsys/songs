-- August 2026: tech playlist and standard wallpapers learn mp3 audio items.
-- Both ALTERs are additive and safe on live data.
ALTER TABLE tech_media_favorites
    MODIFY media_type enum('image','video','audio')
        COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'image';

ALTER TABLE standard_wallpapers
    ADD COLUMN media_type enum('image','video','audio')
        NOT NULL DEFAULT 'image' AFTER src;
