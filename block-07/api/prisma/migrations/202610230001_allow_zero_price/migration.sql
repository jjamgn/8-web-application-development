-- Block6 accepts integer prices >= 0; keep the original Block5 migration intact.
ALTER TABLE "Dish" DROP CONSTRAINT "Dish_price_positive";
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_price_positive" CHECK ("price" >= 0);
