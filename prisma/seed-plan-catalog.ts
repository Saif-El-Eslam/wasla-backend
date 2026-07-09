import { MenuPlan, PlanFeatureValueType, Prisma, PrismaClient } from '@prisma/client';

const unlimited = 999999;

const plans = [
  {
    code: MenuPlan.FREE,
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
    code: MenuPlan.MENU_STARTER,
    publicName: { ar: 'Wasla Starter', en: 'Wasla Starter' },
    internalName: 'Wasla Starter',
    description: { ar: 'Affordable menu digitization.', en: 'Affordable menu digitization.' },
    priceAnnualEgp: 500,
    displayOrder: 20,
    active: true,
    comingSoon: false,
  },
  {
    code: MenuPlan.MENU_PRO,
    publicName: { ar: 'Wasla Pro', en: 'Wasla Pro' },
    internalName: 'Wasla Pro',
    description: {
      ar: 'Higher AI and analytics capacity.',
      en: 'Higher AI and analytics capacity.',
    },
    priceAnnualEgp: 1500,
    displayOrder: 30,
    active: true,
    comingSoon: false,
  },
  {
    code: MenuPlan.MENU_MULTI_BRANCH,
    publicName: { ar: 'Wasla Business', en: 'Wasla Business' },
    internalName: 'Wasla Business',
    description: {
      ar: 'For growing multi-branch venues.',
      en: 'For growing multi-branch venues.',
    },
    priceAnnualEgp: 3000,
    displayOrder: 40,
    active: true,
    comingSoon: false,
  },
  {
    code: MenuPlan.WASLA_COMPLETE,
    publicName: { ar: 'Wasla Suite', en: 'Wasla Suite' },
    internalName: 'Wasla Suite',
    description: {
      ar: 'Premium suite tier for Release 2.',
      en: 'Premium suite tier for Release 2.',
    },
    priceAnnualEgp: 5000,
    displayOrder: 50,
    active: true,
    comingSoon: false,
  },
] as const;

const features = [
  ['BRANCH_LIMIT', { ar: 'Branches', en: 'Branches' }, PlanFeatureValueType.NUMBER, 'branches', 10],
  [
    'GEMINI_EXTRACTIONS_MONTHLY',
    { ar: 'Gemini extractions', en: 'Gemini extractions' },
    PlanFeatureValueType.NUMBER,
    'requests/month',
    20,
  ],
  [
    'GEMINI_IMAGES_PER_EXTRACTION',
    { ar: 'Images per extraction', en: 'Images per extraction' },
    PlanFeatureValueType.NUMBER,
    'images/request',
    30,
  ],
  [
    'ANALYTICS_HISTORY_DAYS',
    { ar: 'Analytics history', en: 'Analytics history' },
    PlanFeatureValueType.NUMBER,
    'days',
    40,
  ],
  [
    'ADVANCED_ANALYTICS',
    { ar: 'Advanced analytics', en: 'Advanced analytics' },
    PlanFeatureValueType.BOOLEAN,
    null,
    50,
  ],
  ['QR_BRANDING', { ar: 'QR branding', en: 'QR branding' }, PlanFeatureValueType.TEXT, null, 60],
  [
    'CUSTOM_QR_ASSETS',
    { ar: 'Custom QR assets', en: 'Custom QR assets' },
    PlanFeatureValueType.BOOLEAN,
    null,
    70,
  ],
  [
    'STAFF_USERS',
    { ar: 'Staff users', en: 'Staff users' },
    PlanFeatureValueType.NUMBER,
    'users',
    80,
  ],
  ['LANGUAGES', { ar: 'Languages', en: 'Languages' }, PlanFeatureValueType.NUMBER, 'languages', 90],
  [
    'FINANCE_MODULE',
    { ar: 'Finance module', en: 'Finance module' },
    PlanFeatureValueType.BOOLEAN,
    null,
    100,
  ],
  [
    'FINANCE_ADVANCED_ANALYTICS',
    { ar: 'Advanced finance analytics', en: 'Advanced finance analytics' },
    PlanFeatureValueType.BOOLEAN,
    null,
    110,
  ],
] as const;

function mappingFor(planCode: MenuPlan, featureKey: string) {
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
      STAFF_USERS: { valueInt: 1 },
      LANGUAGES: { valueInt: 1 },
    },
    MENU_STARTER: {
      BRANCH_LIMIT: { valueInt: 1 },
      GEMINI_EXTRACTIONS_MONTHLY: { valueInt: 2 },
      GEMINI_IMAGES_PER_EXTRACTION: { valueInt: 1 },
      ANALYTICS_HISTORY_DAYS: { valueInt: 30 },
      QR_BRANDING: { valueString: 'VENUE_LOGO' },
      STAFF_USERS: { valueInt: 2 },
      LANGUAGES: { valueInt: 2 },
    },
    MENU_PRO: {
      BRANCH_LIMIT: { valueInt: 3 },
      GEMINI_EXTRACTIONS_MONTHLY: { valueInt: 5 },
      GEMINI_IMAGES_PER_EXTRACTION: { valueInt: 2 },
      ANALYTICS_HISTORY_DAYS: { valueInt: 90 },
      ADVANCED_ANALYTICS: { valueBool: true },
      QR_BRANDING: { valueString: 'VENUE_LOGO' },
      STAFF_USERS: { valueInt: 10 },
      LANGUAGES: { valueInt: 2 },
      FINANCE_MODULE: { valueBool: true },
    },
    MENU_MULTI_BRANCH: {
      BRANCH_LIMIT: { valueInt: 10 },
      GEMINI_EXTRACTIONS_MONTHLY: { valueInt: 15 },
      GEMINI_IMAGES_PER_EXTRACTION: { valueInt: 2 },
      ANALYTICS_HISTORY_DAYS: { valueInt: 180 },
      ADVANCED_ANALYTICS: { valueBool: true },
      QR_BRANDING: { valueString: 'FULL_CUSTOM' },
      CUSTOM_QR_ASSETS: { valueBool: true },
      STAFF_USERS: { valueInt: 10 },
      LANGUAGES: { valueInt: 2 },
      FINANCE_MODULE: { valueBool: true },
    },
    WASLA_COMPLETE: {
      BRANCH_LIMIT: { valueInt: 20 },
      GEMINI_EXTRACTIONS_MONTHLY: { valueInt: 30 },
      GEMINI_IMAGES_PER_EXTRACTION: { valueInt: 3 },
      ANALYTICS_HISTORY_DAYS: { valueInt: 365 },
      ADVANCED_ANALYTICS: { valueBool: true }, // not used yet
      QR_BRANDING: { valueString: 'FULL_CUSTOM' },
      CUSTOM_QR_ASSETS: { valueBool: true }, // not used yet
      STAFF_USERS: { valueInt: 30 },
      LANGUAGES: { valueInt: 2 },
      FINANCE_MODULE: { valueBool: true },
      FINANCE_ADVANCED_ANALYTICS: { valueBool: true }, // not used yet
    },
  };

  return values[planCode]?.[featureKey] ?? {};
}

export async function seedPlanCatalog(prisma: PrismaClient) {
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

  const [planRows, featureRows] = await Promise.all([
    prisma.plan.findMany(),
    prisma.feature.findMany(),
  ]);

  for (const plan of planRows) {
    for (const feature of featureRows) {
      const value = mappingFor(plan.code, feature.key);
      const data = {
        enabled: true,
        valueInt: value.valueInt ?? null,
        valueBool: value.valueBool ?? null,
        valueString: value.valueString ?? null,
        valueJson: Prisma.JsonNull,
      };

      await prisma.planFeatureMapping.upsert({
        where: { planId_featureId: { planId: plan.id, featureId: feature.id } },
        update: data,
        create: { planId: plan.id, featureId: feature.id, ...data },
      });
    }
  }
}
