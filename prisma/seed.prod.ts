import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

async function seedPlanLimits() {
  const plans = [
    {
      plan: 'FREE',
      displayName: { ar: 'Free', en: 'Free' },
      description: { ar: 'Starter trial limits for one branch.', en: 'Starter trial limits for one branch.' },
      branchLimit: 1,
      extractionMonthlyLimit: 1,
      extractionMaxImages: 2,
      customQrBranding: false,
      advancedAnalytics: false,
    },
    {
      plan: 'MENU_STARTER',
      displayName: { ar: 'Menu Starter', en: 'Menu Starter' },
      description: { ar: 'Core menu tools for one branch.', en: 'Core menu tools for one branch.' },
      branchLimit: 1,
      extractionMonthlyLimit: 10,
      extractionMaxImages: 4,
      customQrBranding: false,
      advancedAnalytics: false,
    },
    {
      plan: 'MENU_PRO',
      displayName: { ar: 'Menu Pro', en: 'Menu Pro' },
      description: { ar: 'More extraction capacity and QR branding.', en: 'More extraction capacity and QR branding.' },
      branchLimit: 3,
      extractionMonthlyLimit: 50,
      extractionMaxImages: 8,
      customQrBranding: true,
      advancedAnalytics: true,
    },
    {
      plan: 'MENU_MULTI_BRANCH',
      displayName: { ar: 'Menu Multi Branch', en: 'Menu Multi Branch' },
      description: {
        ar: 'Menu tools for growing multi-branch venues.',
        en: 'Menu tools for growing multi-branch venues.',
      },
      branchLimit: 10,
      extractionMonthlyLimit: 100,
      extractionMaxImages: 8,
      customQrBranding: true,
      advancedAnalytics: true,
    },
    {
      plan: 'WASLA_COMPLETE',
      displayName: { ar: 'Wasla Complete', en: 'Wasla Complete' },
      description: {
        ar: 'Complete Wasla plan, with finance reserved for Release 2.',
        en: 'Complete Wasla plan, with finance reserved for Release 2.',
      },
      branchLimit: 20,
      extractionMonthlyLimit: 100,
      extractionMaxImages: 8,
      customQrBranding: true,
      advancedAnalytics: true,
    },
  ] as const;

  await Promise.all(
    plans.map((plan) =>
      prisma.planLimit.upsert({
        where: { plan: plan.plan },
        update: plan,
        create: plan,
      }),
    ),
  );
}

async function main() {
  await prisma.$connect();
  await seedPlanLimits();
  console.log('[seed:prod] No demo users are created in production.');
  console.log('[seed:prod] Release 1 plan limits are ready.');
}

main()
  .catch((error) => {
    console.error('[seed:prod] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
