-- Normalize Vietnamese diacritics for literal, full-text, and fuzzy dish searches.
-- Supabase commonly installs extensions in `extensions`; local PostgreSQL may use `public`.
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.search_unaccent(value text)
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog, extensions, public
AS $$
  SELECT translate(unaccent(value), 'đĐ', 'dD');
$$;

ALTER TABLE public."Dish"
  ADD COLUMN "searchVector" tsvector NOT NULL DEFAULT ''::tsvector;

CREATE OR REPLACE FUNCTION public.refresh_dish_search_vector(p_dish_id integer)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  document text;
BEGIN
  SELECT concat_ws(
    ' ',
    dish."name",
    dish."description",
    coalesce((
      SELECT string_agg(ingredient."name", ' ')
      FROM public."DishIngredient" AS dish_ingredient
      JOIN public."Ingredient" AS ingredient
        ON ingredient."id" = dish_ingredient."ingredientId"
      WHERE dish_ingredient."dishId" = dish."id"
    ), '')
  )
  INTO document
  FROM public."Dish" AS dish
  WHERE dish."id" = p_dish_id;

  IF document IS NOT NULL THEN
    UPDATE public."Dish"
    SET "searchVector" = to_tsvector(
      'simple',
      document || ' ' || public.search_unaccent(document)
    )
    WHERE "id" = p_dish_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_dish_search_vector_from_dish()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
  PERFORM public.refresh_dish_search_vector(NEW."id");
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Dish_searchVector_refresh"
AFTER INSERT OR UPDATE OF "name", "description" ON public."Dish"
FOR EACH ROW
EXECUTE FUNCTION public.refresh_dish_search_vector_from_dish();

CREATE OR REPLACE FUNCTION public.refresh_dish_search_vector_from_dish_ingredient()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_dish_search_vector(OLD."dishId");
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.refresh_dish_search_vector(OLD."dishId");
    IF NEW."dishId" IS DISTINCT FROM OLD."dishId" THEN
      PERFORM public.refresh_dish_search_vector(NEW."dishId");
    END IF;
    RETURN NEW;
  ELSE
    PERFORM public.refresh_dish_search_vector(NEW."dishId");
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER "DishIngredient_searchVector_refresh"
AFTER INSERT OR UPDATE OR DELETE ON public."DishIngredient"
FOR EACH ROW
EXECUTE FUNCTION public.refresh_dish_search_vector_from_dish_ingredient();

CREATE OR REPLACE FUNCTION public.refresh_dish_search_vectors_from_ingredient()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  linked_dish_id integer;
BEGIN
  FOR linked_dish_id IN
    SELECT DISTINCT dish_ingredient."dishId"
    FROM public."DishIngredient" AS dish_ingredient
    WHERE dish_ingredient."ingredientId" = NEW."id"
  LOOP
    PERFORM public.refresh_dish_search_vector(linked_dish_id);
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Ingredient_searchVector_refresh"
AFTER UPDATE OF "name" ON public."Ingredient"
FOR EACH ROW
WHEN (OLD."name" IS DISTINCT FROM NEW."name")
EXECUTE FUNCTION public.refresh_dish_search_vectors_from_ingredient();

DO $$
DECLARE
  dish_id integer;
BEGIN
  FOR dish_id IN SELECT "id" FROM public."Dish" LOOP
    PERFORM public.refresh_dish_search_vector(dish_id);
  END LOOP;
END;
$$;

CREATE INDEX "Dish_searchVector_gin_idx"
  ON public."Dish" USING GIN ("searchVector");
