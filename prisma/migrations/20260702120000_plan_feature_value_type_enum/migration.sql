CREATE TYPE "PlanFeatureValueType" AS ENUM ('BOOLEAN', 'NUMBER', 'TEXT', 'JSON');

ALTER TABLE "Feature"
  ALTER COLUMN "valueType" DROP DEFAULT,
  ALTER COLUMN "valueType" TYPE "PlanFeatureValueType"
    USING "valueType"::"PlanFeatureValueType",
  ALTER COLUMN "valueType" SET DEFAULT 'BOOLEAN';

UPDATE "PlanFeatureMapping" mapping
SET "valueString" = 'WASLA_SIGNED'
FROM "Feature" feature
WHERE mapping."featureId" = feature."id"
  AND feature."key" = 'QR_BRANDING'
  AND mapping."valueString" IS NOT NULL
  AND mapping."valueString" NOT IN ('WASLA_SIGNED', 'VENUE_LOGO', 'FULL_CUSTOM');

UPDATE "PlanFeatureMapping" mapping
SET "valueString" = 'WASLA_SIGNED',
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Plan" plan,
     "Feature" feature
WHERE mapping."planId" = plan."id"
  AND mapping."featureId" = feature."id"
  AND plan."code" = 'MENU_STARTER'
  AND feature."key" = 'QR_BRANDING';
