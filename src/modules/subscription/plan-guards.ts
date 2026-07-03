import { ExtractionJobStatus, SubscriptionStatus } from '@prisma/client';
import { HttpError } from '../../common/http/http-error';
import { prisma } from '../../database/prisma';
import { env } from '../../config/env';
import { featureKeys, unlimitedLimit } from './subscription.constants';
import { getVenuePlanContext } from './subscription.service';

const mutablePlanStatuses: SubscriptionStatus[] = ['TRIALING', 'ACTIVE'];

export const planGuardFeatures = {
  venueMutation: 'SUBSCRIPTION_STATUS',
  branchCreate: featureKeys.branchLimit,
  branchMutation: featureKeys.branchLimit,
  extractionMonthly: featureKeys.geminiExtractionsMonthly,
  extractionImages: featureKeys.geminiImagesPerExtraction,
  analyticsHistory: featureKeys.analyticsHistoryDays,
  advancedAnalytics: featureKeys.advancedAnalytics,
  qrBranding: featureKeys.qrBranding,
  customQrAssets: featureKeys.customQrAssets,
  staffUsers: featureKeys.staffUsers,
  languages: featureKeys.languages,
  financeModule: featureKeys.financeModule,
  financeAdvancedAnalytics: featureKeys.financeAdvancedAnalytics,
} as const;

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

export function subscriptionAllowsMutations(status: SubscriptionStatus) {
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
      feature: planGuardFeatures.branchCreate,
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
      feature: planGuardFeatures.branchMutation,
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
      feature: planGuardFeatures.staffUsers,
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
      feature: planGuardFeatures.languages,
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
      feature: planGuardFeatures.analyticsHistory,
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

export async function getFinanceAllowance(venueId: string) {
  const context = await getVenuePlanContext(venueId);
  const canUseFinance =
    context.financeModule &&
    context.status !== SubscriptionStatus.CANCELED &&
    context.status !== SubscriptionStatus.EXPIRED;
  const historyMonths = context.financeAdvancedAnalytics ? 12 : 3;

  return {
    plan: context.plan,
    subscriptionStatus: context.status,
    canUseFinance,
    canUseAdvancedFinanceAnalytics: context.financeAdvancedAnalytics,
    historyMonths,
  };
}

export async function assertFinanceModuleAllowed(venueId: string) {
  const allowance = await getFinanceAllowance(venueId);

  if (!allowance.canUseFinance) {
    throw new HttpError(403, 'errors.financeModuleRequired', {
      feature: planGuardFeatures.financeModule,
    });
  }

  return allowance;
}

export async function assertFinanceMutationAllowed(venueId: string) {
  await assertFinanceModuleAllowed(venueId);
  return assertVenueCanMutate(venueId);
}

export async function assertFinanceRangeAllowed(venueId: string, from: Date, to: Date) {
  const allowance = await assertFinanceModuleAllowed(venueId);
  const maxMs = allowance.historyMonths * 31 * 24 * 60 * 60 * 1000;

  if (to.getTime() < from.getTime()) {
    throw new HttpError(400, 'errors.invalidDateRange');
  }

  if (to.getTime() - from.getTime() > maxMs) {
    throw new HttpError(403, 'errors.financeRangeLimit', {
      months: allowance.historyMonths,
      feature: allowance.canUseAdvancedFinanceAnalytics
        ? planGuardFeatures.financeAdvancedAnalytics
        : planGuardFeatures.financeModule,
    });
  }

  return allowance;
}
