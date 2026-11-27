-- Approved by the user: remove only Restaurant tables from the Block 11 project.
-- Existing rows/DDL were backed up and restore-tested before this migration.
-- Preserve Photo Gallery tables and all historical _prisma_migrations records.
-- IF EXISTS keeps a fresh Block 11 database deployable; RESTRICT prevents cascading
-- into an unexpected dependent object. PostgreSQL rolls the whole change back on error.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DROP TABLE IF EXISTS public."Dish" RESTRICT;
DROP TABLE IF EXISTS public."Ingredient" RESTRICT;
DROP TABLE IF EXISTS public."Chef" RESTRICT;

COMMIT;
