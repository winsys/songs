-- August 2026: tech playlist learns mp3 audio items.
-- Extends the media_type enum with 'audio' (additive, safe on live data).
ALTER TABLE tech_media_favorites
    MODIFY media_type enum('image','video','audio')
        COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'image';
