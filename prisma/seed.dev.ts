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
      description: { ar: '\u0642\u0647\u0648\u0629 \u0637\u0627\u0632\u062c\u0629', en: 'Freshly brewed coffee' },
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

async function main() {
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
      name: { ar: ar.menu, en: 'Main Branch Menu' },
      theme: 'MODERN',
      showPrices: true,
    },
    create: {
      branchId: mainBranch.id,
      name: { ar: ar.menu, en: 'Main Branch Menu' },
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

  console.log('[seed:dev] Demo owner ready:', { phone, password: 'WaslaDev@2026' });
  console.log('[seed:dev] Branch staff ready:', { phone: staffPhone, password: 'WaslaStaff@2026' });
}

main()
  .catch((error) => {
    console.error('[seed:dev] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
