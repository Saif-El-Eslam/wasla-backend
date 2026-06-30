import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

async function seedPlanCatalog() {
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Plan" ("id", "code", "publicName", "internalName", "description", "priceAnnualEgp", "displayOrder", "active", "comingSoon", "updatedAt") VALUES
      ('plan-free', 'FREE', '{"en":"Wasla Lite","ar":"Wasla Lite"}', 'Wasla Lite', '{"en":"Forever-free Menu SaaS essentials.","ar":"Forever-free Menu SaaS essentials."}', 0, 10, true, false, CURRENT_TIMESTAMP),
      ('plan-menu-starter', 'MENU_STARTER', '{"en":"Wasla Starter","ar":"Wasla Starter"}', 'Wasla Starter', '{"en":"Affordable menu digitization.","ar":"Affordable menu digitization."}', 250, 20, true, false, CURRENT_TIMESTAMP),
      ('plan-menu-pro', 'MENU_PRO', '{"en":"Wasla Pro","ar":"Wasla Pro"}', 'Wasla Pro', '{"en":"Higher AI and analytics capacity.","ar":"Higher AI and analytics capacity."}', 600, 30, true, false, CURRENT_TIMESTAMP),
      ('plan-menu-multi-branch', 'MENU_MULTI_BRANCH', '{"en":"Wasla Business","ar":"Wasla Business"}', 'Wasla Business', '{"en":"For growing multi-branch venues.","ar":"For growing multi-branch venues."}', 1200, 40, true, false, CURRENT_TIMESTAMP),
      ('plan-wasla-complete', 'WASLA_COMPLETE', '{"en":"Wasla Suite","ar":"Wasla Suite"}', 'Wasla Suite', '{"en":"Premium suite tier for Release 2.","ar":"Premium suite tier for Release 2."}', NULL, 50, true, true, CURRENT_TIMESTAMP)
    ON CONFLICT ("code") DO UPDATE SET
      "publicName" = EXCLUDED."publicName", "internalName" = EXCLUDED."internalName", "description" = EXCLUDED."description",
      "priceAnnualEgp" = EXCLUDED."priceAnnualEgp", "displayOrder" = EXCLUDED."displayOrder", "active" = EXCLUDED."active",
      "comingSoon" = EXCLUDED."comingSoon", "updatedAt" = CURRENT_TIMESTAMP;

    INSERT INTO "Feature" ("id", "key", "name", "valueType", "unit", "displayOrder", "active", "updatedAt") VALUES
      ('feature-branch-limit', 'BRANCH_LIMIT', '{"en":"Branches","ar":"Branches"}', 'NUMBER', 'branches', 10, true, CURRENT_TIMESTAMP),
      ('feature-gemini-extractions-monthly', 'GEMINI_EXTRACTIONS_MONTHLY', '{"en":"Gemini extractions","ar":"Gemini extractions"}', 'NUMBER', 'requests/month', 20, true, CURRENT_TIMESTAMP),
      ('feature-gemini-images-per-extraction', 'GEMINI_IMAGES_PER_EXTRACTION', '{"en":"Images per extraction","ar":"Images per extraction"}', 'NUMBER', 'images/request', 30, true, CURRENT_TIMESTAMP),
      ('feature-analytics-history-days', 'ANALYTICS_HISTORY_DAYS', '{"en":"Analytics history","ar":"Analytics history"}', 'NUMBER', 'days', 40, true, CURRENT_TIMESTAMP),
      ('feature-advanced-analytics', 'ADVANCED_ANALYTICS', '{"en":"Advanced analytics","ar":"Advanced analytics"}', 'BOOLEAN', NULL, 50, true, CURRENT_TIMESTAMP),
      ('feature-qr-branding', 'QR_BRANDING', '{"en":"QR branding","ar":"QR branding"}', 'TEXT', NULL, 60, true, CURRENT_TIMESTAMP),
      ('feature-custom-qr-assets', 'CUSTOM_QR_ASSETS', '{"en":"Custom QR assets","ar":"Custom QR assets"}', 'BOOLEAN', NULL, 70, true, CURRENT_TIMESTAMP),
      ('feature-staff-users', 'STAFF_USERS', '{"en":"Staff users","ar":"Staff users"}', 'NUMBER', 'users', 80, true, CURRENT_TIMESTAMP),
      ('feature-languages', 'LANGUAGES', '{"en":"Languages","ar":"Languages"}', 'NUMBER', 'languages', 90, true, CURRENT_TIMESTAMP),
      ('feature-finance-module', 'FINANCE_MODULE', '{"en":"Finance module","ar":"Finance module"}', 'BOOLEAN', NULL, 100, true, CURRENT_TIMESTAMP)
    ON CONFLICT ("key") DO UPDATE SET
      "name" = EXCLUDED."name", "valueType" = EXCLUDED."valueType", "unit" = EXCLUDED."unit",
      "displayOrder" = EXCLUDED."displayOrder", "active" = EXCLUDED."active", "updatedAt" = CURRENT_TIMESTAMP;

    INSERT INTO "PlanFeatureMapping" ("id", "planId", "featureId", "enabled", "valueInt", "valueBool", "valueString", "updatedAt")
    SELECT 'map-' || p."code" || '-' || f."key", p."id", f."id", true,
      CASE f."key"
        WHEN 'BRANCH_LIMIT' THEN CASE p."code" WHEN 'MENU_MULTI_BRANCH' THEN 10 WHEN 'WASLA_COMPLETE' THEN 10 ELSE 1 END
        WHEN 'GEMINI_EXTRACTIONS_MONTHLY' THEN CASE p."code" WHEN 'FREE' THEN 0 WHEN 'MENU_STARTER' THEN 2 WHEN 'MENU_PRO' THEN 15 ELSE 999999 END
        WHEN 'GEMINI_IMAGES_PER_EXTRACTION' THEN CASE p."code" WHEN 'FREE' THEN 0 WHEN 'MENU_STARTER' THEN 3 ELSE 8 END
        WHEN 'ANALYTICS_HISTORY_DAYS' THEN CASE p."code" WHEN 'FREE' THEN 7 WHEN 'MENU_STARTER' THEN 30 WHEN 'MENU_PRO' THEN 90 ELSE 999999 END
        WHEN 'STAFF_USERS' THEN CASE p."code" WHEN 'FREE' THEN 2 WHEN 'MENU_STARTER' THEN 5 WHEN 'MENU_PRO' THEN 10 ELSE 999999 END
        WHEN 'LANGUAGES' THEN CASE p."code" WHEN 'FREE' THEN 1 WHEN 'MENU_STARTER' THEN 2 ELSE 999999 END
        ELSE NULL
      END,
      CASE f."key"
        WHEN 'ADVANCED_ANALYTICS' THEN p."code" IN ('MENU_PRO', 'MENU_MULTI_BRANCH', 'WASLA_COMPLETE')
        WHEN 'CUSTOM_QR_ASSETS' THEN p."code" IN ('MENU_MULTI_BRANCH', 'WASLA_COMPLETE')
        WHEN 'FINANCE_MODULE' THEN p."code" = 'WASLA_COMPLETE'
        ELSE NULL
      END,
      CASE f."key"
        WHEN 'QR_BRANDING' THEN CASE p."code" WHEN 'FREE' THEN 'WASLA_SIGNED' WHEN 'MENU_MULTI_BRANCH' THEN 'FULL_CUSTOM' WHEN 'WASLA_COMPLETE' THEN 'FULL_CUSTOM' ELSE 'VENUE_LOGO' END
        ELSE NULL
      END,
      CURRENT_TIMESTAMP
    FROM "Plan" p CROSS JOIN "Feature" f
    ON CONFLICT ("planId", "featureId") DO UPDATE SET
      "enabled" = EXCLUDED."enabled", "valueInt" = EXCLUDED."valueInt", "valueBool" = EXCLUDED."valueBool",
      "valueString" = EXCLUDED."valueString", "updatedAt" = CURRENT_TIMESTAMP;
  `);
}

async function main() {
  await prisma.$connect();
  await seedPlanCatalog();
  if (process.env.SUPER_ADMIN_PHONE && process.env.SUPER_ADMIN_PASSWORD) {
    const passwordHash = await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD, 12);
    await prisma.user.upsert({
      where: { phone: process.env.SUPER_ADMIN_PHONE },
      update: {
        venueId: null,
        name: process.env.SUPER_ADMIN_NAME ?? 'Wasla Platform Admin',
        role: 'SUPER_ADMIN',
        passwordHash,
        phoneVerifiedAt: new Date(),
      },
      create: {
        venueId: null,
        phone: process.env.SUPER_ADMIN_PHONE,
        name: process.env.SUPER_ADMIN_NAME ?? 'Wasla Platform Admin',
        role: 'SUPER_ADMIN',
        passwordHash,
        phoneVerifiedAt: new Date(),
      },
    });
    console.log('[seed:prod] Super admin user is ready.');
  }
  console.log('[seed:prod] No demo users are created in production.');
  console.log('[seed:prod] Release 1 plan catalog is ready.');
}

main()
  .catch((error) => {
    console.error('[seed:prod] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
