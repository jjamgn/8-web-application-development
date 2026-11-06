CREATE EXTENSION IF NOT EXISTS unaccent;
SET search_path TO public, extensions;

-- Resolve the extension schema explicitly: Supabase commonly uses extensions.
-- A fixed dictionary makes this immutable wrapper usable in expression indexes.
DO $migration$
DECLARE
  extension_schema text;
  function_body text;
BEGIN
  SELECT n.nspname INTO extension_schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'unaccent';
  function_body := format(
    'SELECT lower(%I.unaccent(%L::regdictionary, translate(coalesce($1, ''''), ''Đđ'', ''Dd'')))',
    extension_schema, format('%I.unaccent', extension_schema)
  );
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.b7_normalize(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS %L',
    function_body
  );
END
$migration$;

CREATE INDEX IF NOT EXISTS "Dish_name_normalized_trgm_idx" ON "Dish" USING GIN (public.b7_normalize(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Dish_document_normalized_fts_idx" ON "Dish" USING GIN (to_tsvector('simple', public.b7_normalize(coalesce(name, '') || ' ' || coalesce(description, ''))));
CREATE INDEX IF NOT EXISTS "Ingredient_name_normalized_trgm_idx" ON "Ingredient" USING GIN (public.b7_normalize(name) gin_trgm_ops);
