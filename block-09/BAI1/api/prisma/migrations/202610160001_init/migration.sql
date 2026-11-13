-- CreateTable
CREATE TABLE "Chef" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "specialty" VARCHAR(200) NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "unit" VARCHAR(30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dish" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(12,0) NOT NULL,
    "category" VARCHAR(60) NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "imagePath" TEXT NOT NULL,
    "chefId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishIngredient" (
    "dishId" INTEGER NOT NULL,
    "ingredientId" INTEGER NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "DishIngredient_pkey" PRIMARY KEY ("dishId","ingredientId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_name_key" ON "Ingredient"("name");

-- CreateIndex
CREATE INDEX "Dish_category_available_idx" ON "Dish"("category", "available");

-- CreateIndex
CREATE INDEX "Dish_chefId_idx" ON "Dish"("chefId");

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "Chef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishIngredient" ADD CONSTRAINT "DishIngredient_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishIngredient" ADD CONSTRAINT "DishIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- This SSR app accesses records through its server connection, never through the public Data API.
ALTER TABLE "Chef" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ingredient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Dish" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DishIngredient" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "Dish" ADD CONSTRAINT "Dish_price_positive" CHECK ("price" >= 1000);
ALTER TABLE "DishIngredient" ADD CONSTRAINT "DishIngredient_quantity_positive" CHECK ("quantity" > 0);
