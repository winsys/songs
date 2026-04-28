-- =====================================================================
-- Migration: renumber the Synodal Bible NT books to canonical Protestant
-- ordering (Romans → Hebrews, then James → Jude, then Revelation).
--
-- Why
-- ---
-- The Synodal translation in this DB was imported using the traditional
-- Slavic / Eastern Orthodox NT order: General Epistles (James → Jude)
-- come BEFORE Pauline Epistles. Other Russian translations like
-- "Новый Русский Перевод" use the standard Western/Protestant order
-- (Pauline → General). When `setBibleTranslation` cross-resolves a
-- book by BOOK_NUM, it lands on the wrong book — e.g. "2 Петра" in
-- Synodal (BOOK_NUM=47) maps to "2 Коринфянам" in NRP, also BOOK_NUM=47.
--
-- After this migration both translations agree on canonical numbering:
--   45 Romans, 46 1 Cor, … 58 Hebrews, 59 James, 60 1 Peter,
--   61 2 Peter, 62 1 John, 63 2 John, 64 3 John, 65 Jude, 66 Revelation.
--
-- Existing sermon chips are unaffected: chips carry data-verse-text +
-- data-book-id (row PK is stable across renumbering). data-book-num is
-- informational and is not used to re-resolve verses on display.
--
-- Visible side effect: in the Synodal books list, NT order changes
-- from Slavic to Protestant. This matches what worship apps in
-- Russian-speaking Protestant churches typically show.
--
-- Idempotency: the WHERE BETWEEN clauses are guarded by the temporary
-- 1000+ offset, so re-running cleanly fails if the data is already
-- canonical. To re-run after a manual revert, restore Slavic order
-- first, then run this migration again.
--
-- Run only if Synodal's TRANSLATION_ID = 1. Verify with:
--   SELECT ID, NAME FROM bible_translations WHERE NAME LIKE '%Синодал%';
-- =====================================================================

START TRANSACTION;

-- Step 1: shift Synodal NT books to a temporary high range so that
-- subsequent UPDATEs cannot collide with each other on the unique
-- (TRANSLATION_ID, BOOK_NUM) tuple.
UPDATE bible_books
SET BOOK_NUM = BOOK_NUM + 1000
WHERE TRANSLATION_ID = 1
  AND BOOK_NUM BETWEEN 45 AND 65;

-- Step 2: write canonical Protestant NT numbering.
UPDATE bible_books
SET BOOK_NUM = CASE BOOK_NUM
    WHEN 1045 THEN 59   -- Иакова          (was Slavic-45 → canonical-59)
    WHEN 1046 THEN 60   -- 1 Петра         (46 → 60)
    WHEN 1047 THEN 61   -- 2 Петра         (47 → 61)
    WHEN 1048 THEN 62   -- 1 Иоанна        (48 → 62)
    WHEN 1049 THEN 63   -- 2 Иоанна        (49 → 63)
    WHEN 1050 THEN 64   -- 3 Иоанна        (50 → 64)
    WHEN 1051 THEN 65   -- Иуды            (51 → 65)
    WHEN 1052 THEN 45   -- К Римлянам      (52 → 45)
    WHEN 1053 THEN 46   -- 1 Коринфянам    (53 → 46)
    WHEN 1054 THEN 47   -- 2 Коринфянам    (54 → 47)
    WHEN 1055 THEN 48   -- Галатам         (55 → 48)
    WHEN 1056 THEN 49   -- Ефесянам        (56 → 49)
    WHEN 1057 THEN 50   -- Филиппийцам     (57 → 50)
    WHEN 1058 THEN 51   -- Колосянам       (58 → 51)
    WHEN 1059 THEN 52   -- 1 Фессалоникийцам (59 → 52)
    WHEN 1060 THEN 53   -- 2 Фессалоникийцам (60 → 53)
    WHEN 1061 THEN 54   -- 1 Тимофею       (61 → 54)
    WHEN 1062 THEN 55   -- 2 Тимофею       (62 → 55)
    WHEN 1063 THEN 56   -- Титу            (63 → 56)
    WHEN 1064 THEN 57   -- Филимону        (64 → 57)
    WHEN 1065 THEN 58   -- Евреям          (65 → 58)
END
WHERE TRANSLATION_ID = 1
  AND BOOK_NUM BETWEEN 1045 AND 1065;

-- Sanity check: every NT book of Synodal must now have a canonical
-- BOOK_NUM in 45..66 with no leftovers in the 1000+ range.
SELECT BOOK_NUM, NAME FROM bible_books
WHERE TRANSLATION_ID = 1 AND BOOK_NUM > 100
ORDER BY BOOK_NUM;
-- ↑ should return zero rows.

COMMIT;
