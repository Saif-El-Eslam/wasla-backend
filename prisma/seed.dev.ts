import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

const ar = {
  venue: '\u0648\u0635\u0644\u0629 \u062f\u064a\u0645\u0648 \u0643\u0627\u0641\u064a\u0647',
  venueDescription:
    '\u0645\u0646\u0634\u0623\u0629 \u062a\u062c\u0631\u064a\u0628\u064a\u0629 \u0644\u062a\u0637\u0648\u064a\u0631 \u0648\u0635\u0644\u0629',
  mainBranch: '\u0627\u0644\u0641\u0631\u0639 \u0627\u0644\u0631\u0626\u064a\u0633\u064a',
  secondBranch: '\u0641\u0631\u0639 \u0627\u0644\u062a\u062c\u0645\u0639',
  menu: '\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0641\u0631\u0639 \u0627\u0644\u0631\u0626\u064a\u0633\u064a',
  category: '\u0645\u0634\u0631\u0648\u0628\u0627\u062a \u0633\u0627\u062e\u0646\u0629',
  item: '\u0642\u0647\u0648\u0629 \u062a\u0631\u0643\u064a',
};

async function upsertMainCategory(menuId: string) {
  const existing = await prisma.menuCategory.findFirst({
    where: { menuId, sortOrder: 0 },
  });

  if (existing) {
    return prisma.menuCategory.update({
      where: { id: existing.id },
      data: {
        name: { ar: ar.category, en: 'Hot Drinks' },
        active: true,
      },
    });
  }

  return prisma.menuCategory.create({
    data: {
      menuId,
      name: { ar: ar.category, en: 'Hot Drinks' },
      active: true,
      sortOrder: 0,
    },
  });
}

async function upsertMainItem(categoryId: string) {
  const existing = await prisma.menuItem.findFirst({
    where: { categoryId, sortOrder: 0 },
  });

  if (existing) {
    const item = await prisma.menuItem.update({
      where: { id: existing.id },
      data: {
        name: { ar: ar.item, en: 'Turkish Coffee' },
        price: '45.00',
        available: true,
      },
    });
    await upsertItemPrices(item.id);
    return item;
  }

  const item = await prisma.menuItem.create({
    data: {
      categoryId,
      name: { ar: ar.item, en: 'Turkish Coffee' },
      description: {
        ar: '\u0642\u0647\u0648\u0629 \u0637\u0627\u0632\u062c\u0629',
        en: 'Freshly brewed coffee',
      },
      price: '45.00',
      available: true,
      sortOrder: 0,
      tags: ['hot', 'classic'],
    },
  });
  await upsertItemPrices(item.id);
  return item;
}

async function upsertItemPrices(itemId: string) {
  const prices = [
    { label: 'S', price: '35.00', sortOrder: 0 },
    { label: 'M', price: '45.00', sortOrder: 1 },
    { label: 'L', price: '55.00', sortOrder: 2 },
  ];

  await Promise.all(
    prices.map((price) =>
      prisma.menuItemPrice.upsert({
        where: {
          itemId_label: {
            itemId,
            label: price.label,
          },
        },
        update: {
          price: price.price,
          sortOrder: price.sortOrder,
        },
        create: {
          itemId,
          ...price,
        },
      }),
    ),
  );
}

async function seedPlanCatalog() {
  const plans = [
    {
      code: 'FREE',
      publicName: { ar: 'Wasla Lite', en: 'Wasla Lite' },
      internalName: 'Wasla Lite',
      description: {
        ar: 'Forever-free Menu SaaS essentials.',
        en: 'Forever-free Menu SaaS essentials.',
      },
      priceAnnualEgp: 0,
      displayOrder: 10,
      active: true,
      comingSoon: false,
    },
    {
      code: 'MENU_STARTER',
      publicName: { ar: 'Wasla Starter', en: 'Wasla Starter' },
      internalName: 'Wasla Starter',
      description: { ar: 'Affordable menu digitization.', en: 'Affordable menu digitization.' },
      priceAnnualEgp: 250,
      displayOrder: 20,
      active: true,
      comingSoon: false,
    },
    {
      code: 'MENU_PRO',
      publicName: { ar: 'Wasla Pro', en: 'Wasla Pro' },
      internalName: 'Wasla Pro',
      description: {
        ar: 'Higher AI and analytics capacity.',
        en: 'Higher AI and analytics capacity.',
      },
      priceAnnualEgp: 600,
      displayOrder: 30,
      active: true,
      comingSoon: false,
    },
    {
      code: 'MENU_MULTI_BRANCH',
      publicName: { ar: 'Wasla Business', en: 'Wasla Business' },
      internalName: 'Wasla Business',
      description: {
        ar: 'For growing multi-branch venues.',
        en: 'For growing multi-branch venues.',
      },
      priceAnnualEgp: 1200,
      displayOrder: 40,
      active: true,
      comingSoon: false,
    },
    {
      code: 'WASLA_COMPLETE',
      publicName: { ar: 'Wasla Suite', en: 'Wasla Suite' },
      internalName: 'Wasla Suite',
      description: {
        ar: 'Premium suite tier for Release 2.',
        en: 'Premium suite tier for Release 2.',
      },
      priceAnnualEgp: null,
      displayOrder: 50,
      active: true,
      comingSoon: true,
    },
  ] as const;
  const features = [
    ['BRANCH_LIMIT', { ar: 'Branches', en: 'Branches' }, 'NUMBER', 'branches', 10],
    [
      'GEMINI_EXTRACTIONS_MONTHLY',
      { ar: 'Gemini extractions', en: 'Gemini extractions' },
      'NUMBER',
      'requests/month',
      20,
    ],
    [
      'GEMINI_IMAGES_PER_EXTRACTION',
      { ar: 'Images per extraction', en: 'Images per extraction' },
      'NUMBER',
      'images/request',
      30,
    ],
    [
      'ANALYTICS_HISTORY_DAYS',
      { ar: 'Analytics history', en: 'Analytics history' },
      'NUMBER',
      'days',
      40,
    ],
    [
      'ADVANCED_ANALYTICS',
      { ar: 'Advanced analytics', en: 'Advanced analytics' },
      'BOOLEAN',
      null,
      50,
    ],
    ['QR_BRANDING', { ar: 'QR branding', en: 'QR branding' }, 'TEXT', null, 60],
    ['CUSTOM_QR_ASSETS', { ar: 'Custom QR assets', en: 'Custom QR assets' }, 'BOOLEAN', null, 70],
    ['STAFF_USERS', { ar: 'Staff users', en: 'Staff users' }, 'NUMBER', 'users', 80],
    ['LANGUAGES', { ar: 'Languages', en: 'Languages' }, 'NUMBER', 'languages', 90],
    ['FINANCE_MODULE', { ar: 'Finance module', en: 'Finance module' }, 'BOOLEAN', null, 100],
    [
      'FINANCE_ADVANCED_ANALYTICS',
      { ar: 'Advanced finance analytics', en: 'Advanced finance analytics' },
      'BOOLEAN',
      null,
      110,
    ],
  ] as const;

  await Promise.all(
    plans.map((plan) =>
      prisma.plan.upsert({
        where: { code: plan.code },
        update: plan,
        create: plan,
      }),
    ),
  );
  await Promise.all(
    features.map(([key, name, valueType, unit, displayOrder]) =>
      prisma.feature.upsert({
        where: { key },
        update: { name, valueType, unit, displayOrder, active: true },
        create: { key, name, valueType, unit, displayOrder, active: true },
      }),
    ),
  );

  const planRows = await prisma.plan.findMany();
  const featureRows = await prisma.feature.findMany();
  const mappingFor = (code: string, key: string) => {
    const values: Record<
      string,
      Record<string, { valueInt?: number; valueBool?: boolean; valueString?: string }>
    > = {
      FREE: {
        BRANCH_LIMIT: { valueInt: 1 },
        GEMINI_EXTRACTIONS_MONTHLY: { valueInt: 0 },
        GEMINI_IMAGES_PER_EXTRACTION: { valueInt: 0 },
        ANALYTICS_HISTORY_DAYS: { valueInt: 7 },
        QR_BRANDING: { valueString: 'WASLA_SIGNED' },
        STAFF_USERS: { valueInt: 2 },
        LANGUAGES: { valueInt: 1 },
      },
      MENU_STARTER: {
        BRANCH_LIMIT: { valueInt: 1 },
        GEMINI_EXTRACTIONS_MONTHLY: { valueInt: 2 },
        GEMINI_IMAGES_PER_EXTRACTION: { valueInt: 3 },
        ANALYTICS_HISTORY_DAYS: { valueInt: 30 },
        QR_BRANDING: { valueString: 'WASLA_SIGNED' },
        STAFF_USERS: { valueInt: 5 },
        LANGUAGES: { valueInt: 2 },
      },
      MENU_PRO: {
        BRANCH_LIMIT: { valueInt: 1 },
        GEMINI_EXTRACTIONS_MONTHLY: { valueInt: 15 },
        GEMINI_IMAGES_PER_EXTRACTION: { valueInt: 8 },
        ANALYTICS_HISTORY_DAYS: { valueInt: 90 },
        ADVANCED_ANALYTICS: { valueBool: true },
        QR_BRANDING: { valueString: 'VENUE_LOGO' },
        STAFF_USERS: { valueInt: 10 },
        LANGUAGES: { valueInt: 999999 },
      },
      MENU_MULTI_BRANCH: {
        BRANCH_LIMIT: { valueInt: 10 },
        GEMINI_EXTRACTIONS_MONTHLY: { valueInt: 999999 },
        GEMINI_IMAGES_PER_EXTRACTION: { valueInt: 8 },
        ANALYTICS_HISTORY_DAYS: { valueInt: 999999 },
        ADVANCED_ANALYTICS: { valueBool: true },
        QR_BRANDING: { valueString: 'FULL_CUSTOM' },
        CUSTOM_QR_ASSETS: { valueBool: true },
        STAFF_USERS: { valueInt: 999999 },
        LANGUAGES: { valueInt: 999999 },
      },
      WASLA_COMPLETE: {
        BRANCH_LIMIT: { valueInt: 10 },
        GEMINI_EXTRACTIONS_MONTHLY: { valueInt: 999999 },
        GEMINI_IMAGES_PER_EXTRACTION: { valueInt: 8 },
        ANALYTICS_HISTORY_DAYS: { valueInt: 999999 },
        ADVANCED_ANALYTICS: { valueBool: true },
        QR_BRANDING: { valueString: 'FULL_CUSTOM' },
        CUSTOM_QR_ASSETS: { valueBool: true },
        STAFF_USERS: { valueInt: 999999 },
        LANGUAGES: { valueInt: 999999 },
        FINANCE_MODULE: { valueBool: true },
        FINANCE_ADVANCED_ANALYTICS: { valueBool: true },
      },
    };

    return values[code]?.[key] ?? {};
  };

  for (const plan of planRows) {
    for (const feature of featureRows) {
      const value = mappingFor(plan.code, feature.key);
      await prisma.planFeatureMapping.upsert({
        where: { planId_featureId: { planId: plan.id, featureId: feature.id } },
        update: {
          enabled: true,
          valueInt: value.valueInt,
          valueBool: value.valueBool,
          valueString: value.valueString,
        },
        create: { planId: plan.id, featureId: feature.id, enabled: true, ...value },
      });
    }
  }
}

async function main() {
  await seedPlanCatalog();

  const phone = '+201000000001';
  const passwordHash = await bcrypt.hash('WaslaDev@2026', 12);

  const user = await prisma.user.upsert({
    where: { phone },
    update: {
      name: 'Wasla Demo Owner',
      role: 'OWNER',
      passwordHash,
      phoneVerifiedAt: new Date(),
    },
    create: {
      phone,
      name: 'Wasla Demo Owner',
      role: 'OWNER',
      passwordHash,
      phoneVerifiedAt: new Date(),
    },
  });

  const venue = await prisma.venue.upsert({
    where: { slug: 'wasla-demo-cafe' },
    update: {
      ownerId: user.id,
      name: { ar: ar.venue, en: 'Wasla Demo Cafe' },
      description: { ar: ar.venueDescription, en: 'Demo venue for Wasla development' },
    },
    create: {
      ownerId: user.id,
      type: 'CAFE',
      name: { ar: ar.venue, en: 'Wasla Demo Cafe' },
      slug: 'wasla-demo-cafe',
      description: { ar: ar.venueDescription, en: 'Demo venue for Wasla development' },
      defaultLocale: 'ar',
      supportedLocales: ['ar', 'en'],
      phone,
      whatsapp: phone,
    },
  });

  const mainBranch = await prisma.branch.upsert({
    where: {
      venueId_slug: {
        venueId: venue.id,
        slug: 'main',
      },
    },
    update: {
      name: { ar: ar.mainBranch, en: 'Main Branch' },
      isMain: true,
      active: true,
    },
    create: {
      venueId: venue.id,
      name: { ar: ar.mainBranch, en: 'Main Branch' },
      slug: 'main',
      isMain: true,
      active: true,
      phone,
      whatsapp: phone,
    },
  });

  const secondBranch = await prisma.branch.upsert({
    where: {
      venueId_slug: {
        venueId: venue.id,
        slug: 'new-cairo',
      },
    },
    update: {
      name: { ar: ar.secondBranch, en: 'New Cairo Branch' },
      active: true,
    },
    create: {
      venueId: venue.id,
      name: { ar: ar.secondBranch, en: 'New Cairo Branch' },
      slug: 'new-cairo',
      active: true,
      phone,
      whatsapp: phone,
    },
  });

  const menu = await prisma.menu.upsert({
    where: { branchId: mainBranch.id },
    update: {
      theme: 'MODERN',
      showPrices: true,
    },
    create: {
      branchId: mainBranch.id,
      theme: 'MODERN',
      showPrices: true,
      qrCode: {
        create: {
          shortCode: 'demo-main',
        },
      },
      analytics: {
        create: {
          viewCount: 12,
          qrScanCount: 4,
        },
      },
    },
  });

  await prisma.menuQrCode.upsert({
    where: { menuId: menu.id },
    update: { shortCode: 'demo-main' },
    create: {
      menuId: menu.id,
      shortCode: 'demo-main',
    },
  });

  await prisma.menuAnalytics.upsert({
    where: { menuId: menu.id },
    update: {
      viewCount: 12,
      qrScanCount: 4,
    },
    create: {
      menuId: menu.id,
      viewCount: 12,
      qrScanCount: 4,
    },
  });

  const category = await upsertMainCategory(menu.id);
  await upsertMainItem(category.id);

  await prisma.subscription.upsert({
    where: { venueId: venue.id },
    update: {
      plan: 'FREE',
      status: 'TRIALING',
    },
    create: {
      venueId: venue.id,
      plan: 'FREE',
      status: 'TRIALING',
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { venueId: venue.id },
  });

  const staffPhone = '+201000000002';
  const staffPasswordHash = await bcrypt.hash('WaslaStaff@2026', 12);
  const staff = await prisma.user.upsert({
    where: { phone: staffPhone },
    update: {
      venueId: venue.id,
      name: 'Wasla Branch Staff',
      role: 'STAFF',
      passwordHash: staffPasswordHash,
      phoneVerifiedAt: new Date(),
    },
    create: {
      venueId: venue.id,
      phone: staffPhone,
      name: 'Wasla Branch Staff',
      role: 'STAFF',
      passwordHash: staffPasswordHash,
      phoneVerifiedAt: new Date(),
    },
  });

  await prisma.userBranchAccess.upsert({
    where: {
      userId_branchId: {
        userId: staff.id,
        branchId: secondBranch.id,
      },
    },
    update: {},
    create: {
      userId: staff.id,
      branchId: secondBranch.id,
    },
  });

  const superAdminPhone = '+201000000000';
  const superAdminPasswordHash = await bcrypt.hash('WaslaAdmin@2026', 12);
  await prisma.user.upsert({
    where: { phone: superAdminPhone },
    update: {
      venueId: null,
      name: 'Wasla Platform Admin',
      role: 'SUPER_ADMIN',
      passwordHash: superAdminPasswordHash,
      phoneVerifiedAt: new Date(),
    },
    create: {
      venueId: null,
      phone: superAdminPhone,
      name: 'Wasla Platform Admin',
      role: 'SUPER_ADMIN',
      passwordHash: superAdminPasswordHash,
      phoneVerifiedAt: new Date(),
    },
  });

  console.log('[seed:dev] Demo owner ready:', { phone, password: 'WaslaDev@2026' });
  console.log('[seed:dev] Branch staff ready:', { phone: staffPhone, password: 'WaslaStaff@2026' });
  console.log('[seed:dev] Super admin ready:', {
    phone: superAdminPhone,
    password: 'WaslaAdmin@2026',
  });
}

main()
  .catch((error) => {
    console.error('[seed:dev] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
