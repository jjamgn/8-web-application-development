CREATE TABLE "Specialty" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    CONSTRAINT "Specialty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Specialty_name_key" ON "Specialty"("name");

CREATE TABLE "ChefSpecialty" (
    "chefId" INTEGER NOT NULL,
    "specialtyId" INTEGER NOT NULL,
    CONSTRAINT "ChefSpecialty_pkey" PRIMARY KEY ("chefId", "specialtyId")
);

CREATE INDEX "ChefSpecialty_specialtyId_idx" ON "ChefSpecialty"("specialtyId");

INSERT INTO "Specialty" ("name")
SELECT DISTINCT CASE lower(btrim(item))
    WHEN 'bánh ngọt' THEN 'Bánh ngọt'
    WHEN 'hải sản' THEN 'Hải sản'
    ELSE btrim(item)
  END
FROM "Chef"
CROSS JOIN LATERAL regexp_split_to_table("Chef"."specialty", '\s*&\s*') AS split(item)
WHERE btrim(item) <> ''
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "ChefSpecialty" ("chefId", "specialtyId")
SELECT "Chef"."id", "Specialty"."id"
FROM "Chef"
CROSS JOIN LATERAL regexp_split_to_table("Chef"."specialty", '\s*&\s*') AS split(item)
JOIN "Specialty" ON "Specialty"."name" = CASE lower(btrim(item))
  WHEN 'bánh ngọt' THEN 'Bánh ngọt'
  WHEN 'hải sản' THEN 'Hải sản'
  ELSE btrim(item)
END
WHERE btrim(item) <> ''
ON CONFLICT ("chefId", "specialtyId") DO NOTHING;

ALTER TABLE "Chef" DROP COLUMN "specialty";

ALTER TABLE "ChefSpecialty"
  ADD CONSTRAINT "ChefSpecialty_chefId_fkey"
  FOREIGN KEY ("chefId") REFERENCES "Chef"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChefSpecialty"
  ADD CONSTRAINT "ChefSpecialty_specialtyId_fkey"
  FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
