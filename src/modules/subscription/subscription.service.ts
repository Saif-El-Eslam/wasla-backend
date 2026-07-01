import {
  ExtractionJobStatus,
  MenuPlan,
  PaymentProvider,
  Prisma,
  SubscriptionStatus,
  type UserRole,
} from '@prisma/client';
import { prisma } from '../../database/prisma';
import { requireAccessUser } from '../../common/auth/branch-access';
import { HttpError } from '../../common/http/http-error';
import type { SessionPayload } from '../../common/middleware/auth.middleware';
import { env } from '../../config/env';
import { featureKeys, unlimitedLimit, type FeatureKey } from './subscription.constants';
import type {
  updateFeatureSchema,
  updatePlanFeatureMappingSchema,
  updatePlanSchema,
  updateVenueSubscriptionSchema,
  upsertFeatureSchema,
  upsertPlanFeatureMappingSchema,
  upsertPlanSchema,
} from './subscription.schemas';
import type { z } from 'zod';

const mutablePlanStatuses: SubscriptionStatus[] = ['TRIALING', 'ACTIVE'];

function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function isUnlimited(value: number | null | undefined) {
  return value !== null && value !== undefined && value >= unlimitedLimit;
}

function plainLimit(value: number | null | undefined) {
  return isUnlimited(value) ? null : (value ?? 0);
}

function requireUser(session?: SessionPayload) {
  if (!session?.sub) {
    throw new HttpError(401, 'errors.authRequired');
  }

  return session.sub;
}

export async function requireSuperAdmin(session?: SessionPayload) {
  const userId = requireUser(session);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!user || user.role !== 'SUPER_ADMIN') {
    throw new HttpError(403, 'errors.superAdminRequired');
  }

  return user;
}

async function ensurePlanCatalogExists() {
  const freePlan = await prisma.plan.findUnique({ where: { code: MenuPlan.FREE } });

  if (!freePlan) {
    throw new HttpError(500, 'errors.planCatalogMissing');
  }
}

type SubscriptionHistorySnapshot = {
  id: string;
  venueId: string;
  plan: MenuPlan;
  status: SubscriptionStatus;
  paymentProvider: PaymentProvider;
  currentPeriodEnds: Date | null;
  notes: string | null;
};

async function recordSubscriptionHistory(
  tx: Prisma.TransactionClient,
  subscription: SubscriptionHistorySnapshot,
  changeType: string,
  changedById?: string | null,
) {
  const planRecord = await tx.plan.findUnique({
    where: { code: subscription.plan },
    select: { priceAnnualEgp: true },
  });

  await tx.subscriptionHistory.create({
    data: {
      subscriptionId: subscription.id,
      venueId: subscription.venueId,
      plan: subscription.plan,
      status: subscription.status,
      paymentProvider: subscription.paymentProvider,
      annualAmountEgp: planRecord?.priceAnnualEgp ?? null,
      currentPeriodEnds: subscription.currentPeriodEnds,
      notes: subscription.notes,
      changeType,
      changedById: changedById ?? null,
    },
  });
}

function isPaidHistoryEntry(subscription: {
  plan: MenuPlan;
  status: SubscriptionStatus;
  annualAmountEgp: number | null;
}) {
  return (
    isPaidActiveSubscription(subscription) &&
    (subscription.annualAmountEgp ?? 0) > 0
  );
}

function isPaidActiveSubscription(subscription: { plan: MenuPlan; status: SubscriptionStatus }) {
  return (
    subscription.plan !== MenuPlan.FREE &&
    subscription.status !== SubscriptionStatus.CANCELED &&
    subscription.status !== SubscriptionStatus.EXPIRED
  );
}

function calculateTotalRevenueFromHistory(
  history: Array<{
    venueId: string;
    plan: MenuPlan;
    status: SubscriptionStatus;
    annualAmountEgp: number | null;
  }>,
) {
  const openPaidVenues = new Set<string>();

  return history.reduce((sum, subscription) => {
    if (!isPaidHistoryEntry(subscription)) {
      openPaidVenues.delete(subscription.venueId);
      return sum;
    }

    if (openPaidVenues.has(subscription.venueId)) {
      return sum;
    }

    openPaidVenues.add(subscription.venueId);
    return sum + (subscription.annualAmountEgp ?? 0);
  }, 0);
}

async function normalizeSubscription(venueId: string) {
  await ensurePlanCatalogExists();
  const subscription =
    (await prisma.subscription.findUnique({ where: { venueId } })) ??
    (await prisma.$transaction(async (tx) => {
      const created = await tx.subscription.create({
        data: {
          venueId,
          plan: MenuPlan.FREE,
          status: SubscriptionStatus.ACTIVE,
          paymentProvider: PaymentProvider.MANUAL,
        },
      });

      await recordSubscriptionHistory(tx, created, 'SYSTEM_CREATE_FREE');

      return created;
    }));

  const periodExpired =
    subscription.currentPeriodEnds !== null &&
    subscription.currentPeriodEnds.getTime() < Date.now() &&
    subscription.status !== 'PAST_DUE';

  if (subscription.status === 'CANCELED' || subscription.status === 'EXPIRED' || periodExpired) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { venueId },
        data: {
          plan: MenuPlan.FREE,
          status: SubscriptionStatus.ACTIVE,
          paymentProvider: PaymentProvider.MANUAL,
          currentPeriodEnds: null,
        },
      });

      await recordSubscriptionHistory(tx, updated, 'SYSTEM_RESET_FREE');

      return updated;
    });
  }

  return subscription;
}

export async function getPlanFeatureValues(plan: MenuPlan) {
  const planRecord = await prisma.plan.findUnique({
    where: { code: plan },
    include: {
      featureMappings: {
        include: { feature: true },
      },
    },
  });

  if (!planRecord) {
    throw new HttpError(500, 'errors.planCatalogMissing');
  }

  return Object.fromEntries(
    planRecord.featureMappings.map((mapping) => [
      mapping.feature.key,
      {
        enabled: mapping.enabled,
        valueInt: mapping.valueInt,
        valueBool: mapping.valueBool,
        valueString: mapping.valueString,
        valueJson: mapping.valueJson,
      },
    ]),
  ) as Record<
    string,
    {
      enabled: boolean;
      valueInt: number | null;
      valueBool: boolean | null;
      valueString: string | null;
      valueJson: Prisma.JsonValue | null;
    }
  >;
}

function numberFeature(
  features: Awaited<ReturnType<typeof getPlanFeatureValues>>,
  key: FeatureKey,
  fallback = 0,
) {
  const value = features[key];
  return value?.enabled === false ? 0 : (value?.valueInt ?? fallback);
}

function booleanFeature(
  features: Awaited<ReturnType<typeof getPlanFeatureValues>>,
  key: FeatureKey,
) {
  const value = features[key];
  return Boolean(value?.enabled && value.valueBool);
}

function textFeature(
  features: Awaited<ReturnType<typeof getPlanFeatureValues>>,
  key: FeatureKey,
  fallback = '',
) {
  const value = features[key];
  return value?.enabled === false ? fallback : (value?.valueString ?? fallback);
}

export async function getVenuePlanContext(venueId: string) {
  const subscription = await normalizeSubscription(venueId);
  const features = await getPlanFeatureValues(subscription.plan);

  return {
    subscription,
    plan: subscription.plan,
    status: subscription.status,
    paymentProvider: subscription.paymentProvider,
    features,
    branchLimit: numberFeature(features, featureKeys.branchLimit, 1),
    extractionMonthlyLimit: numberFeature(features, featureKeys.geminiExtractionsMonthly, 0),
    extractionMaxImages: numberFeature(features, featureKeys.geminiImagesPerExtraction, 0),
    analyticsHistoryDays: numberFeature(features, featureKeys.analyticsHistoryDays, 7),
    advancedAnalytics: booleanFeature(features, featureKeys.advancedAnalytics),
    qrBranding: textFeature(features, featureKeys.qrBranding, 'WASLA_SIGNED'),
    customQrAssets: booleanFeature(features, featureKeys.customQrAssets),
    staffUserLimit: numberFeature(features, featureKeys.staffUsers, 2),
    languageLimit: numberFeature(features, featureKeys.languages, 1),
  };
}

function subscriptionAllowsMutations(status: SubscriptionStatus) {
  return mutablePlanStatuses.includes(status);
}

export async function assertVenueCanMutate(venueId: string) {
  const context = await getVenuePlanContext(venueId);

  if (context.status === 'PAST_DUE') {
    throw new HttpError(403, 'errors.subscriptionPastDue');
  }

  if (!subscriptionAllowsMutations(context.status)) {
    throw new HttpError(403, 'errors.subscriptionInactive');
  }

  return context;
}

export async function assertBranchCreateAllowed(venueId: string) {
  const context = await assertVenueCanMutate(venueId);
  const branchCount = await prisma.branch.count({ where: { venueId } });

  if (!isUnlimited(context.branchLimit) && branchCount >= context.branchLimit) {
    throw new HttpError(403, 'errors.planBranchLimit', {
      feature: featureKeys.branchLimit,
      limit: context.branchLimit,
      used: branchCount,
    });
  }
}

export async function assertBranchMutationAllowed(venueId: string, branchId: string) {
  const context = await assertVenueCanMutate(venueId);

  if (isUnlimited(context.branchLimit)) {
    return;
  }

  const branches = await prisma.branch.findMany({
    where: { venueId },
    orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  const allowedIds = new Set(branches.slice(0, context.branchLimit).map((branch) => branch.id));

  if (!allowedIds.has(branchId)) {
    throw new HttpError(403, 'errors.planOverLimitBranch', {
      feature: featureKeys.branchLimit,
      limit: context.branchLimit,
    });
  }
}

export async function getExtractionAllowance(venueId: string) {
  const context = await getVenuePlanContext(venueId);
  const usedThisMonth = await prisma.extractionJob.count({
    where: {
      venueId,
      createdAt: { gte: monthStart() },
      status: {
        in: [
          ExtractionJobStatus.COMPLETED,
          ExtractionJobStatus.APPROVED,
          ExtractionJobStatus.PROCESSING,
          ExtractionJobStatus.PENDING,
          ExtractionJobStatus.REJECTED,
        ],
      },
    },
  });
  const canExtract =
    subscriptionAllowsMutations(context.status) &&
    context.extractionMonthlyLimit > 0 &&
    (isUnlimited(context.extractionMonthlyLimit) || usedThisMonth < context.extractionMonthlyLimit);

  return {
    plan: context.plan,
    subscriptionStatus: context.status,
    canExtract,
    monthlyExtractions: plainLimit(context.extractionMonthlyLimit),
    unlimitedExtractions: isUnlimited(context.extractionMonthlyLimit),
    usedThisMonth,
    remainingThisMonth: isUnlimited(context.extractionMonthlyLimit)
      ? null
      : Math.max(context.extractionMonthlyLimit - usedThisMonth, 0),
    maxImages: Math.min(context.extractionMaxImages, env.GEMINI_MAX_IMAGES_PER_EXTRACTION),
  };
}

export async function assertExtractionAllowed(venueId: string, imageCount: number) {
  const allowance = await getExtractionAllowance(venueId);

  if (allowance.subscriptionStatus === 'PAST_DUE') {
    throw new HttpError(403, 'errors.subscriptionPastDue');
  }

  if (!allowance.canExtract) {
    throw new HttpError(403, 'errors.extractionPlanLimit');
  }

  if (imageCount > allowance.maxImages) {
    throw new HttpError(400, 'errors.extractionImageLimit');
  }

  return allowance;
}

export async function assertStaffUserCreateAllowed(venueId: string) {
  const context = await assertVenueCanMutate(venueId);
  const userCount = await prisma.user.count({ where: { venueId } });

  if (!isUnlimited(context.staffUserLimit) && userCount >= context.staffUserLimit) {
    throw new HttpError(403, 'errors.planStaffLimit', {
      feature: featureKeys.staffUsers,
      limit: context.staffUserLimit,
      used: userCount,
    });
  }
}

export async function assertLanguageLimitAllowed(
  venueId: string,
  supportedLocales: string[] | undefined,
) {
  if (!supportedLocales) {
    return;
  }

  const context = await assertVenueCanMutate(venueId);

  if (!isUnlimited(context.languageLimit) && supportedLocales.length > context.languageLimit) {
    throw new HttpError(403, 'errors.planLanguageLimit', {
      feature: featureKeys.languages,
      limit: context.languageLimit,
      used: supportedLocales.length,
    });
  }
}

export async function assertAnalyticsAllowed(venueId: string, days: number, advanced: boolean) {
  const context = await getVenuePlanContext(venueId);

  if (advanced && !context.advancedAnalytics) {
    throw new HttpError(403, 'errors.advancedAnalyticsRequired');
  }

  if (!isUnlimited(context.analyticsHistoryDays) && days > context.analyticsHistoryDays) {
    throw new HttpError(403, 'errors.analyticsHistoryLimit', {
      feature: featureKeys.analyticsHistoryDays,
      limit: context.analyticsHistoryDays,
    });
  }

  return context;
}

export async function assertQrAssetAllowed(venueId: string, customAsset = false) {
  const context = await assertVenueCanMutate(venueId);

  if (customAsset && !context.customQrAssets) {
    throw new HttpError(403, 'errors.customQrRequired');
  }

  return context;
}

function manualUpgradeUrl(input: { venueName: string; targetPlan: MenuPlan }) {
  const phone = (process.env.WASLA_SALES_WHATSAPP ?? '+201000000001').replace(/[^\d]/g, '');
  const text = encodeURIComponent(
    `Hi Wasla, I want to upgrade ${input.venueName} to ${input.targetPlan}.`,
  );

  return `https://wa.me/${phone}?text=${text}`;
}

async function usageForVenue(venueId: string) {
  const [branchCount, userCount, extractionCount, venue] = await prisma.$transaction([
    prisma.branch.count({ where: { venueId } }),
    prisma.user.count({ where: { venueId } }),
    prisma.extractionJob.count({
      where: {
        venueId,
        createdAt: { gte: monthStart() },
        status: {
          in: [
            ExtractionJobStatus.COMPLETED,
            ExtractionJobStatus.APPROVED,
            ExtractionJobStatus.PROCESSING,
            ExtractionJobStatus.PENDING,
            ExtractionJobStatus.REJECTED,
          ],
        },
      },
    }),
    prisma.venue.findUniqueOrThrow({
      where: { id: venueId },
      select: { supportedLocales: true },
    }),
  ]);

  return {
    branches: branchCount,
    users: userCount,
    extractionsThisMonth: extractionCount,
    languages: venue.supportedLocales.length,
  };
}

function venueEnglishName(value: Prisma.JsonValue, fallback: string) {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'en' in value) {
    const text = (value as Record<string, unknown>).en;
    return typeof text === 'string' && text.trim() ? text : fallback;
  }

  return fallback;
}

export async function getTenantSubscription(session?: SessionPayload) {
  const user = await requireAccessUser(session);
  const context = await getVenuePlanContext(user.venueId);
  const [venue, usage, plans, features] = await Promise.all([
    prisma.venue.findUniqueOrThrow({
      where: { id: user.venueId },
      select: { name: true, slug: true },
    }),
    usageForVenue(user.venueId),
    prisma.plan.findMany({
      where: { active: true },
      orderBy: { displayOrder: 'asc' },
      include: {
        featureMappings: {
          include: { feature: true },
          orderBy: { feature: { displayOrder: 'asc' } },
        },
      },
    }),
    prisma.feature.findMany({ where: { active: true }, orderBy: { displayOrder: 'asc' } }),
  ]);

  return {
    canManageBilling: user.role === 'OWNER',
    subscription: {
      ...context.subscription,
      limits: {
        branches: plainLimit(context.branchLimit),
        unlimitedBranches: isUnlimited(context.branchLimit),
        monthlyExtractions: plainLimit(context.extractionMonthlyLimit),
        unlimitedExtractions: isUnlimited(context.extractionMonthlyLimit),
        imagesPerExtraction: context.extractionMaxImages,
        analyticsHistoryDays: plainLimit(context.analyticsHistoryDays),
        allTimeAnalytics: isUnlimited(context.analyticsHistoryDays),
        staffUsers: plainLimit(context.staffUserLimit),
        unlimitedStaffUsers: isUnlimited(context.staffUserLimit),
        languages: plainLimit(context.languageLimit),
        unlimitedLanguages: isUnlimited(context.languageLimit),
        advancedAnalytics: context.advancedAnalytics,
        qrBranding: context.qrBranding,
        customQrAssets: context.customQrAssets,
      },
    },
    usage,
    plans: plans.map((plan) => ({
      ...plan,
      upgradeUrl: manualUpgradeUrl({
        venueName: venueEnglishName(venue.name, venue.slug),
        targetPlan: plan.code,
      }),
    })),
    features,
  };
}

export async function getAdminSubscriptionOverview(session?: SessionPayload) {
  await requireSuperAdmin(session);
  const now = new Date();
  const soon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const [venues, subscriptions, expiringSoon, history] = await Promise.all([
    prisma.venue.count(),
    prisma.subscription.findMany({
      include: { planRecord: true },
    }),
    prisma.subscription.findMany({
      where: {
        plan: { not: MenuPlan.FREE },
        currentPeriodEnds: { gte: now, lte: soon },
        status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] },
      },
      include: { venue: true, planRecord: true },
      orderBy: { currentPeriodEnds: 'asc' },
      take: 10,
    }),
    prisma.subscriptionHistory.findMany({
      orderBy: [{ venueId: 'asc' }, { sequence: 'asc' }],
    }),
  ]);
  const latestHistoryByVenue = new Map<string, (typeof history)[number]>();

  for (const item of history) {
    latestHistoryByVenue.set(item.venueId, item);
  }

  const activeRevenue = latestHistoryByVenue.size
    ? Array.from(latestHistoryByVenue.values())
        .filter(
          (subscription) =>
            subscription.plan !== 'FREE' &&
            subscription.status !== 'CANCELED' &&
            subscription.status !== 'EXPIRED',
        )
        .reduce((sum, subscription) => sum + (subscription.annualAmountEgp ?? 0), 0)
    : subscriptions
        .filter(
          (subscription) =>
            subscription.plan !== 'FREE' &&
            subscription.status !== 'CANCELED' &&
            subscription.status !== 'EXPIRED',
        )
        .reduce((sum, subscription) => sum + (subscription.planRecord.priceAnnualEgp ?? 0), 0);

  const totalRevenue = calculateTotalRevenueFromHistory(history);

  return {
    metrics: {
      venues,
      subscriptions: subscriptions.length,
      activeRevenueAnnualEgp: activeRevenue,
      totalRevenueAnnualEgp: totalRevenue,
      paidSubscriptions: subscriptions.filter((subscription) => subscription.plan !== 'FREE')
        .length,
      pastDue: subscriptions.filter((subscription) => subscription.status === 'PAST_DUE').length,
    },
    expiringSoon,
  };
}

export async function listAdminVenues(
  session: SessionPayload | undefined,
  filters: { search?: string; status?: SubscriptionStatus; plan?: MenuPlan },
) {
  await requireSuperAdmin(session);

  const where: Prisma.VenueWhereInput = {
    AND: [
      filters.search
        ? {
            OR: [
              { slug: { contains: filters.search, mode: 'insensitive' } },
              { phone: { contains: filters.search, mode: 'insensitive' } },
              { whatsapp: { contains: filters.search, mode: 'insensitive' } },
              { name: { path: ['en'], string_contains: filters.search, mode: 'insensitive' } },
              { name: { path: ['ar'], string_contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {},
      filters.status || filters.plan
        ? {
            subscription: {
              ...(filters.status ? { status: filters.status } : {}),
              ...(filters.plan ? { plan: filters.plan } : {}),
            },
          }
        : {},
    ],
  };

  return {
    venues: await prisma.venue.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 80,
      include: {
        subscription: { include: { planRecord: true } },
        _count: { select: { branches: true, users: true } },
      },
    }),
  };
}

export async function updateVenueSubscription(
  session: SessionPayload | undefined,
  venueId: string,
  input: z.infer<typeof updateVenueSubscriptionSchema>,
) {
  await requireSuperAdmin(session);
  const { recreate, ...subscriptionInput } = input;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.subscription.findUnique({
      where: { venueId },
    });

    if (recreate && existing && isPaidActiveSubscription(existing)) {
      await recordSubscriptionHistory(
        tx,
        { ...existing, status: SubscriptionStatus.CANCELED },
        'ADMIN_RECREATE_CANCEL',
        session?.sub,
      );
    }

    const subscription = existing
      ? await tx.subscription.update({
          where: { id: existing.id },
          data: subscriptionInput,
          include: { planRecord: true },
        })
      : await tx.subscription.create({
          data: { venueId, ...subscriptionInput },
          include: { planRecord: true },
        });

    await recordSubscriptionHistory(
      tx,
      subscription,
      recreate || !existing ? 'ADMIN_ASSIGNMENT' : 'ADMIN_UPDATE',
      session?.sub,
    );

    return subscription;
  });
}

export async function listAdminPlans(session?: SessionPayload) {
  await requireSuperAdmin(session);

  return {
    plans: await prisma.plan.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        featureMappings: {
          include: { feature: true },
          orderBy: { feature: { displayOrder: 'asc' } },
        },
      },
    }),
  };
}

export async function createAdminPlan(
  session: SessionPayload | undefined,
  input: z.infer<typeof upsertPlanSchema>,
) {
  await requireSuperAdmin(session);
  return prisma.plan.create({ data: input });
}

export async function updateAdminPlan(
  session: SessionPayload | undefined,
  planId: string,
  input: z.infer<typeof updatePlanSchema>,
) {
  await requireSuperAdmin(session);
  return prisma.plan.update({ where: { id: planId }, data: input });
}

export async function deleteAdminPlan(session: SessionPayload | undefined, planId: string) {
  await requireSuperAdmin(session);
  await prisma.plan.delete({ where: { id: planId } });
  return { deleted: true };
}

export async function listAdminFeatures(session?: SessionPayload) {
  await requireSuperAdmin(session);
  return { features: await prisma.feature.findMany({ orderBy: { displayOrder: 'asc' } }) };
}

export async function createAdminFeature(
  session: SessionPayload | undefined,
  input: z.infer<typeof upsertFeatureSchema>,
) {
  await requireSuperAdmin(session);
  return prisma.feature.create({ data: input });
}

export async function updateAdminFeature(
  session: SessionPayload | undefined,
  featureId: string,
  input: z.infer<typeof updateFeatureSchema>,
) {
  await requireSuperAdmin(session);
  return prisma.feature.update({ where: { id: featureId }, data: input });
}

export async function deleteAdminFeature(session: SessionPayload | undefined, featureId: string) {
  await requireSuperAdmin(session);
  await prisma.feature.delete({ where: { id: featureId } });
  return { deleted: true };
}

export async function createAdminMapping(
  session: SessionPayload | undefined,
  input: z.infer<typeof upsertPlanFeatureMappingSchema>,
) {
  await requireSuperAdmin(session);
  const data = {
    ...input,
    valueJson:
      input.valueJson === undefined ? undefined : (input.valueJson as Prisma.InputJsonValue),
  };

  return prisma.planFeatureMapping.upsert({
    where: {
      planId_featureId: {
        planId: input.planId,
        featureId: input.featureId,
      },
    },
    update: data,
    create: data,
    include: { plan: true, feature: true },
  });
}

export async function updateAdminMapping(
  session: SessionPayload | undefined,
  mappingId: string,
  input: z.infer<typeof updatePlanFeatureMappingSchema>,
) {
  await requireSuperAdmin(session);
  const data = {
    ...input,
    valueJson:
      input.valueJson === undefined ? undefined : (input.valueJson as Prisma.InputJsonValue),
  };

  return prisma.planFeatureMapping.update({
    where: { id: mappingId },
    data,
    include: { plan: true, feature: true },
  });
}

export async function deleteAdminMapping(session: SessionPayload | undefined, mappingId: string) {
  await requireSuperAdmin(session);
  await prisma.planFeatureMapping.delete({ where: { id: mappingId } });
  return { deleted: true };
}

export function roleCanViewBilling(role: UserRole | string | undefined) {
  return role === 'OWNER';
}
