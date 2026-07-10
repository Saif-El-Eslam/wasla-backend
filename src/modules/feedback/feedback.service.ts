import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import {
  branchScopeWhere,
  requireAccessUser,
  requireBranchAccess,
} from '../../common/auth/branch-access';
import { HttpError } from '../../common/http/http-error';
import type { SessionPayload } from '../../common/middleware/auth.middleware';
import { buildPaginationMeta } from '../../common/pagination/pagination';
import type { z } from 'zod';
import type {
  feedbackQuerySchema,
  publicFeedbackListQuerySchema,
  publicFeedbackSchema,
  updateFeedbackStatusSchema,
} from './feedback.schemas';

const feedbackBranchSelect = Prisma.validator<Prisma.BranchSelect>()({
  id: true,
  venueId: true,
  name: true,
  slug: true,
  googleReviewUrl: true,
  menu: {
    select: {
      id: true,
      publishedAt: true,
    },
  },
});

function isPrivateIssue(rating: number) {
  return rating <= 3;
}

function feedbackSelect() {
  return {
    id: true,
    venueId: true,
    branchId: true,
    menuId: true,
    rating: true,
    comment: true,
    guestName: true,
    guestPhone: true,
    status: true,
    locale: true,
    googleReviewOffered: true,
    googleReviewClickedAt: true,
    ownerNotifiedAt: true,
    createdAt: true,
    branch: { select: { id: true, name: true, slug: true } },
  } satisfies Prisma.GuestFeedbackSelect;
}

export async function createPublicFeedback(
  input: z.infer<typeof publicFeedbackSchema>,
  requestMeta: { userAgent?: string } = {},
) {
  const branch = await prisma.branch.findFirst({
    where: {
      id: input.branchId,
      venueId: input.venueId,
      active: true,
    },
    select: feedbackBranchSelect,
  });

  if (!branch) {
    throw new HttpError(404, 'errors.branchNotFound');
  }

  const menuId = input.menuId && branch.menu?.id === input.menuId ? input.menuId : branch.menu?.id;
  const shouldOfferGoogleReview = input.rating >= 4 && Boolean(branch.googleReviewUrl);
  const privateIssue = isPrivateIssue(input.rating);
  const feedback = await prisma.guestFeedback.create({
    data: {
      venueId: branch.venueId,
      branchId: branch.id,
      menuId,
      rating: input.rating,
      comment: input.comment || null,
      guestName: input.guestName || null,
      guestPhone: input.guestPhone || null,
      locale: input.locale,
      googleReviewOffered: shouldOfferGoogleReview,
      ownerNotifiedAt: privateIssue ? new Date() : null,
      userAgent: requestMeta.userAgent?.slice(0, 300),
    },
    select: feedbackSelect(),
  });

  return {
    feedback,
    booster: {
      showGoogleReview: shouldOfferGoogleReview,
      googleReviewUrl: shouldOfferGoogleReview ? branch.googleReviewUrl : null,
      privateIssue,
    },
  };
}

function publicFeedbackSelect() {
  return {
    id: true,
    rating: true,
    comment: true,
    guestName: true,
    createdAt: true,
    branch: { select: { id: true, name: true, slug: true } },
  } satisfies Prisma.GuestFeedbackSelect;
}

export async function getPublicFeedbackList(query: z.infer<typeof publicFeedbackListQuerySchema>) {
  const where: Prisma.GuestFeedbackWhereInput = {
    venueId: query.venueId,
    branchId: query.branchId,
    rating: { gte: 4 },
    status: { not: 'ARCHIVED' },
    // comment: { not: null },
    branch: {
      active: true,
      venueId: query.venueId,
    },
  };
  const skip = (query.page - 1) * query.limit;

  const [items, total, aggregate] = await prisma.$transaction([
    prisma.guestFeedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
      select: publicFeedbackSelect(),
    }),
    prisma.guestFeedback.count({ where }),
    prisma.guestFeedback.aggregate({
      where,
      _avg: { rating: true },
    }),
  ]);

  return {
    summary: {
      averageRating: aggregate._avg.rating ?? 0,
      total,
    },
    feedback: items,
    pagination: buildPaginationMeta(total, {
      paginate: true,
      page: query.page,
      limit: query.limit,
      skip,
    }),
  };
}

export async function markGoogleReviewClick(feedbackId: string) {
  const feedback = await prisma.guestFeedback.findUnique({
    where: { id: feedbackId },
    select: { id: true, googleReviewOffered: true, googleReviewClickedAt: true },
  });

  if (!feedback?.googleReviewOffered) {
    throw new HttpError(404, 'errors.feedbackNotFound');
  }

  await prisma.guestFeedback.update({
    where: { id: feedback.id },
    data: { googleReviewClickedAt: feedback.googleReviewClickedAt ?? new Date() },
  });

  return { tracked: true };
}

export async function getFeedbackDashboard(
  session: SessionPayload | undefined,
  query: z.infer<typeof feedbackQuerySchema>,
) {
  const user = await requireAccessUser(session);
  const branchWhere = branchScopeWhere(user);

  if (query.branchId) {
    await requireBranchAccess(session, query.branchId);
  }

  const where: Prisma.GuestFeedbackWhereInput = {
    venueId: user.venueId,
    branchId: query.branchId,
    rating: query.rating,
    ...(query.status ? { status: query.status } : { status: { not: 'ARCHIVED' } }),
    ...(query.issueOnly ? { rating: { lte: 3 } } : {}),
    branch: branchWhere,
  };
  const skip = (query.page - 1) * query.limit;

  const [items, filteredTotal, aggregate, privateIssues, redirectCount, total, ratingBuckets] =
    await prisma.$transaction([
      prisma.guestFeedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        select: feedbackSelect(),
      }),
      prisma.guestFeedback.count({ where }),
      prisma.guestFeedback.aggregate({
        where: { venueId: user.venueId, branch: branchWhere },
        _avg: { rating: true },
      }),
      prisma.guestFeedback.count({
        where: { venueId: user.venueId, rating: { lte: 3 }, branch: branchWhere },
      }),
      prisma.guestFeedback.count({
        where: { venueId: user.venueId, googleReviewClickedAt: { not: null }, branch: branchWhere },
      }),
      prisma.guestFeedback.count({
        where: { venueId: user.venueId, branch: branchWhere },
      }),
      prisma.guestFeedback.groupBy({
        by: ['rating'],
        where: { venueId: user.venueId, branch: branchWhere },
        _count: { _all: true },
      }),
    ]);

  return {
    summary: {
      averageRating: aggregate._avg.rating ?? 0,
      privateIssues,
      redirectCount,
      total,
      ratingBuckets: [1, 2, 3, 4, 5].map((rating) => ({
        rating,
        count: ratingBuckets.find((bucket) => bucket.rating === rating)?._count._all ?? 0,
      })),
    },
    feedback: items,
    pagination: buildPaginationMeta(filteredTotal, {
      paginate: true,
      page: query.page,
      limit: query.limit,
      skip,
    }),
  };
}

export async function updateFeedbackStatus(
  session: SessionPayload | undefined,
  feedbackId: string,
  input: z.infer<typeof updateFeedbackStatusSchema>,
) {
  const user = await requireAccessUser(session);
  const feedback = await prisma.guestFeedback.findFirst({
    where: {
      id: feedbackId,
      venueId: user.venueId,
      branch: branchScopeWhere(user),
    },
    select: { id: true },
  });

  if (!feedback) {
    throw new HttpError(404, 'errors.feedbackNotFound');
  }

  return prisma.guestFeedback.update({
    where: { id: feedback.id },
    data: { status: input.status },
    select: feedbackSelect(),
  });
}
