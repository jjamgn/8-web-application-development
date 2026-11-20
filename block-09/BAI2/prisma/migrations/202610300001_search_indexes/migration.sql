CREATE EXTENSION IF NOT EXISTS pg_trgm;
SET search_path TO public, extensions;
CREATE INDEX IF NOT EXISTS "Dish_name_trgm_idx" ON "Dish" USING GIN (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Dish_document_fts_idx" ON "Dish" USING GIN (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, '')));
CREATE INDEX IF NOT EXISTS "Dish_price_id_idx" ON "Dish" (price, id);
