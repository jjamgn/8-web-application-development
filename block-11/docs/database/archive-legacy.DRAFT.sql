-- DRAFT: NOT EXECUTED. Not a Prisma auto-deploy migration.
-- SUPERSEDED: user chose deletion; see LEGACY_REMOVAL.md and migration
-- 202611270002_remove_legacy_restaurant. This historical archive draft was NOT run.
-- Target: dedicated Block 11 Supabase project swuswowkpsffkrvvyblo.
-- Back up and test restore first. Recheck external consumers and dependencies.
-- Only after approval, set this session's explicit opt-in before running:
-- SET block11.review_archive_confirm = 'yes';
-- Preserve _prisma_migrations; never alter historical migration rows/checksums.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF current_setting('block11.review_archive_confirm', true) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'Draft archive not approved/enabled; no tables were moved';
  END IF;
  IF to_regclass('public."Photo"') IS NULL OR to_regclass('public."PhotoChunk"') IS NULL THEN
    RAISE EXCEPTION 'Expected Block 11 schema missing';
  END IF;
  IF to_regclass('public."Chef"') IS NULL OR to_regclass('public."Dish"') IS NULL OR to_regclass('public."Ingredient"') IS NULL THEN
    RAISE EXCEPTION 'Expected legacy tables missing; re-review before proceeding';
  END IF;
  IF to_regclass('legacy_restaurant."Chef"') IS NOT NULL OR to_regclass('legacy_restaurant."Dish"') IS NOT NULL OR to_regclass('legacy_restaurant."Ingredient"') IS NOT NULL THEN
    RAISE EXCEPTION 'Archive destination already contains tables';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'f'
      AND confrelid IN ('public."Chef"'::regclass, 'public."Dish"'::regclass, 'public."Ingredient"'::regclass)
      AND conrelid NOT IN ('public."Chef"'::regclass, 'public."Dish"'::regclass, 'public."Ingredient"'::regclass)
  ) THEN
    RAISE EXCEPTION 'New external foreign key found; re-review dependencies';
  END IF;
END $$;

LOCK TABLE public."Chef", public."Dish", public."Ingredient" IN ACCESS EXCLUSIVE MODE NOWAIT;
CREATE SCHEMA IF NOT EXISTS legacy_restaurant;
ALTER TABLE public."Chef" SET SCHEMA legacy_restaurant;
ALTER TABLE public."Dish" SET SCHEMA legacy_restaurant;
ALTER TABLE public."Ingredient" SET SCHEMA legacy_restaurant;

-- Operator must compare these counts with the pre-change backup/checkpoint.
SELECT 'Chef' AS table_name, count(*) FROM legacy_restaurant."Chef"
UNION ALL SELECT 'Dish', count(*) FROM legacy_restaurant."Dish"
UNION ALL SELECT 'Ingredient', count(*) FROM legacy_restaurant."Ingredient";
COMMIT;

-- Reversible follow-up after checking destination conflicts, only when needed:
-- BEGIN;
-- ALTER TABLE legacy_restaurant."Chef" SET SCHEMA public;
-- ALTER TABLE legacy_restaurant."Dish" SET SCHEMA public;
-- ALTER TABLE legacy_restaurant."Ingredient" SET SCHEMA public;
-- COMMIT;
