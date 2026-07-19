-- Zoom/pan state of the current slide/image on the main display
-- (sermon-page pinch gestures). Empty string = identity (no transform).
-- JSON like {"s":2.1,"x":-0.32,"y":0.18}: s = scale, x/y = translation as
-- a fraction of the content element's own box (translate-after-scale,
-- transform-origin 50% 50%).
--
-- Run ONCE on production BEFORE deploying the code that selects this
-- column (get_image), otherwise both screens break on the unknown column:
--   ALTER TABLE current ADD COLUMN transform VARCHAR(255) NOT NULL DEFAULT '';
-- Reverse:
--   ALTER TABLE current DROP COLUMN transform;

ALTER TABLE current ADD COLUMN transform VARCHAR(255) NOT NULL DEFAULT '';
