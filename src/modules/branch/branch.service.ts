import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { HttpError } from '../../common/http/http-error';
import {
  branchScopeWhere,
  requireAccessUser,
  requireBranchAccess,
  requireVenueAdmin,
} from '../../common/auth/branch-access';
import type { SessionPayload } from '../../common/middleware/auth.middleware';
import { buildPaginationMeta, type PaginationOptions } from '../../common/pagination/pagination';
import { deleteImagesByUrl, imageUrlChanged } from '../../storage/image-storage.service';
import {
  analyticsStatsByBranchIds,
  analyticsStatsByMenuIds,
  analyticsStatsOrEmpty,
  menuAnalyticsSnapshot,
  type AnalyticsStats,
} from '../analytics/analytics-event-log-stats';
import {
  assertBranchCreateAllowed,
  assertBranchMutationAllowed,
  assertVenueCanMutate,
} from '../subscription/plan-guards';
import type { z } from 'zod';
import type { createBranchSchema, updateBranchSchema } from './branch.schemas';

const branchMenuInclude = Prisma.validator<Prisma.BranchInclude>()({
  menu: {
    include: {
      qrCode: true,
      categories: {
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
            include: {
              prices: { orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      },
    },
  },
});

const branchStatsSelect = Prisma.validator<Prisma.BranchSelect>()({
  id: true,
  venueId: true,
  name: true,
  slug: true,
  isMain: true,
  active: true,
  address: true,
  phone: true,
  whatsapp: true,
  logoUrl: true,
  coverUrl: true,
  googleMapsUrl: true,
  googleReviewUrl: true,
  instagramUrl: true,
  facebookUrl: true,
  openingHours: true,
  menu: {
    select: {
      id: true,
      publishedAt: true,
      categories: {
        select: {
          id: true,
          _count: {
            select: { items: true },
          },
        },
      },
    },
  },
});

type BranchWithStats = Prisma.BranchGetPayload<{ select: typeof branchStatsSelect }>;

type BranchListFilters = {
  search?: string;
};

function statsForBranch(branch: BranchWithStats, analytics?: AnalyticsStats) {
  const eventStats = analyticsStatsOrEmpty(analytics);

  return {
    categories: branch.menu?.categories.length ?? 0,
    items: branch.menu?.categories.reduce((sum, category) => sum + category._count.items, 0) ?? 0,
    views: eventStats.views,
    scans: eventStats.scans,
    whatsapp: eventStats.whatsapp,
    calls: eventStats.calls,
    maps: eventStats.maps,
  };
}

function compactBranch(branch: BranchWithStats, analytics?: AnalyticsStats) {
  return {
    id: branch.id,
    venueId: branch.venueId,
    name: branch.name,
    slug: branch.slug,
    isMain: branch.isMain,
    active: branch.active,
    address: branch.address,
    phone: branch.phone,
    whatsapp: branch.whatsapp,
    logoUrl: branch.logoUrl,
    coverUrl: branch.coverUrl,
    googleMapsUrl: branch.googleMapsUrl,
    googleReviewUrl: branch.googleReviewUrl,
    instagramUrl: branch.instagramUrl,
    facebookUrl: branch.facebookUrl,
    openingHours: branch.openingHours,
    menuId: branch.menu?.id ?? null,
    hasMenu: Boolean(branch.menu),
    publishedAt: branch.menu?.publishedAt ?? null,
    stats: statsForBranch(branch, analytics),
  };
}

async function addMenuAnalyticsSnapshots<T extends { menu: { id: string } | null }>(branches: T[]) {
  const menuIds = branches.flatMap((branch) => (branch.menu ? [branch.menu.id] : []));
  const statsByMenuId = await analyticsStatsByMenuIds(menuIds);

  return branches.map((branch) => ({
    ...branch,
    menu: branch.menu
      ? {
          ...branch.menu,
          analytics: menuAnalyticsSnapshot(branch.menu.id, statsByMenuId.get(branch.menu.id)),
        }
      : branch.menu,
  }));
}

function buildBranchSearchWhere(search?: string): Prisma.BranchWhereInput {
  if (!search) {
    return {};
  }

  return {
    OR: [
      { slug: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { whatsapp: { contains: search, mode: 'insensitive' } },
      { name: { path: ['en'], string_contains: search, mode: 'insensitive' } },
      { name: { path: ['ar'], string_contains: search, mode: 'insensitive' } },
    ],
  };
}

export async function listBranches(
  session?: SessionPayload,
  pagination?: PaginationOptions,
  filters: BranchListFilters = {},
) {
  const user = await requireAccessUser(session);
  const where: Prisma.BranchWhereInput = {
    AND: [branchScopeWhere(user), buildBranchSearchWhere(filters.search)],
  };
  const orderBy = [{ isMain: 'desc' as const }, { createdAt: 'asc' as const }];

  if (pagination?.paginate === false) {
    const branches = await prisma.branch.findMany({
      where,
      orderBy,
      include: branchMenuInclude,
    });

    return { branches: await addMenuAnalyticsSnapshots(branches) };
  }

  const paginationOptions = pagination ?? {
    paginate: true,
    page: 1,
    limit: 20,
    skip: 0,
  };

  const [branches, total] = await prisma.$transaction([
    prisma.branch.findMany({
      where,
      orderBy,
      skip: paginationOptions.skip,
      take: paginationOptions.limit,
      include: branchMenuInclude,
    }),
    prisma.branch.count({ where }),
  ]);

  return {
    branches: await addMenuAnalyticsSnapshots(branches),
    pagination: buildPaginationMeta(total, paginationOptions),
  };
}

export async function listBranchOptions(session?: SessionPayload) {
  const user = await requireAccessUser(session);

  return {
    branches: await prisma.branch.findMany({
      where: branchScopeWhere(user),
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        isMain: true,
        active: true,
      },
    }),
  };
}

export async function getBranchesOverview(session?: SessionPayload) {
  const user = await requireAccessUser(session);
  const branches = await prisma.branch.findMany({
    where: branchScopeWhere(user),
    orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    select: branchStatsSelect,
  });
  const statsByBranchId = await analyticsStatsByBranchIds(branches.map((branch) => branch.id));
  const totals = branches.reduce(
    (acc, branch) => {
      const stats = statsForBranch(branch, statsByBranchId.get(branch.id));
      acc.menus += branch.menu ? 1 : 0;
      acc.items += stats.items;
      acc.views += stats.views;
      acc.scans += stats.scans;
      return acc;
    },
    { menus: 0, items: 0, views: 0, scans: 0 },
  );
  const userCount = user.isVenueAdmin
    ? await prisma.user.count({ where: { venueId: user.venueId } })
    : 0;

  return {
    branches: branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      slug: branch.slug,
      active: branch.active,
      hasMenu: Boolean(branch.menu),
      stats: statsForBranch(branch, statsByBranchId.get(branch.id)),
    })),
    totals,
    userCount,
    isAdmin: user.isVenueAdmin,
  };
}

export async function listManagementBranches(session?: SessionPayload) {
  const user = await requireAccessUser(session);
  const branches = await prisma.branch.findMany({
    where: branchScopeWhere(user),
    orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    select: branchStatsSelect,
  });
  const statsByBranchId = await analyticsStatsByBranchIds(branches.map((branch) => branch.id));

  return {
    branches: branches.map((branch) => compactBranch(branch, statsByBranchId.get(branch.id))),
  };
}

export async function getBranchQr(session: SessionPayload | undefined, branchId: string) {
  const { branch } = await requireBranchAccess(session, branchId);
  const venue = await prisma.venue.findUnique({
    where: { id: branch.venueId },
    select: { slug: true },
  });
  const menu = await prisma.menu.findUnique({
    where: { branchId },
    select: {
      id: true,
      publishedAt: true,
      qrCode: true,
    },
  });
  const statsByMenuId = menu ? await analyticsStatsByMenuIds([menu.id]) : new Map();

  return {
    branch: {
      id: branch.id,
      name: branch.name,
      slug: branch.slug,
      phone: branch.phone,
      venueSlug: venue?.slug ?? null,
    },
    menu: menu
      ? { ...menu, analytics: menuAnalyticsSnapshot(menu.id, statsByMenuId.get(menu.id)) }
      : menu,
  };
}

export async function getBranch(session: SessionPayload | undefined, branchId: string) {
  const branch = await prisma.branch.findFirst({
    where: {
      AND: [{ id: branchId }, branchScopeWhere(await requireAccessUser(session))],
    },
    include: branchMenuInclude,
  });

  if (!branch) {
    throw new HttpError(404, 'errors.branchNotFound');
  }

  return branch;
}

export async function createBranch(
  session: SessionPayload | undefined,
  input: z.infer<typeof createBranchSchema>,
) {
  const { venueId } = await requireVenueAdmin(session);
  await assertBranchCreateAllowed(venueId);

  return prisma.$transaction(async (tx) => {
    const shortCode = crypto.randomUUID().slice(0, 8);
    const branch = await tx.branch.create({
      data: {
        venueId,
        ...input,
        openingHours: input.openingHours as Prisma.InputJsonValue | undefined,
        logoUrl: input.logoUrl === '' ? null : input.logoUrl,
        coverUrl: input.coverUrl === '' ? null : input.coverUrl,
        googleMapsUrl: input.googleMapsUrl === '' ? null : input.googleMapsUrl,
        googleReviewUrl: input.googleReviewUrl === '' ? null : input.googleReviewUrl,
        instagramUrl: input.instagramUrl === '' ? null : input.instagramUrl,
        facebookUrl: input.facebookUrl === '' ? null : input.facebookUrl,
      },
    });

    await tx.menu.create({
      data: {
        branchId: branch.id,
        theme: 'MODERN',
        showPrices: true,
        qrCode: {
          create: {
            shortCode,
            targetUrl: `/public/m/${shortCode}`,
          },
        },
      },
    });

    return branch;
  });
}

export async function updateBranch(
  session: SessionPayload | undefined,
  branchId: string,
  input: z.infer<typeof updateBranchSchema>,
) {
  const { user } = await requireBranchAccess(session, branchId);
  const venueId = user.venueId;
  await assertBranchMutationAllowed(venueId, branchId);
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, venueId },
  });

  if (!branch) {
    throw new HttpError(404, 'errors.branchNotFound');
  }

  if (branch.active && input.active === false) {
    const activeBranchCount = await prisma.branch.count({
      where: {
        venueId,
        active: true,
        NOT: { id: branchId },
      },
    });

    if (activeBranchCount === 0) {
      throw new HttpError(400, 'errors.lastActiveBranch');
    }
  }

  const updatedBranch = await prisma.branch.update({
    where: { id: branchId },
    data: {
      ...input,
      openingHours: input.openingHours as Prisma.InputJsonValue | undefined,
      logoUrl: input.logoUrl === '' ? null : input.logoUrl,
      coverUrl: input.coverUrl === '' ? null : input.coverUrl,
      googleMapsUrl: input.googleMapsUrl === '' ? null : input.googleMapsUrl,
      googleReviewUrl: input.googleReviewUrl === '' ? null : input.googleReviewUrl,
      instagramUrl: input.instagramUrl === '' ? null : input.instagramUrl,
      facebookUrl: input.facebookUrl === '' ? null : input.facebookUrl,
    },
  });

  await deleteImagesByUrl([
    input.logoUrl !== undefined && imageUrlChanged(branch.logoUrl, updatedBranch.logoUrl)
      ? branch.logoUrl
      : null,
    input.coverUrl !== undefined && imageUrlChanged(branch.coverUrl, updatedBranch.coverUrl)
      ? branch.coverUrl
      : null,
  ]);

  return updatedBranch;
}

export async function setMainBranch(session: SessionPayload | undefined, branchId: string) {
  const { venueId } = await requireVenueAdmin(session);
  await assertBranchMutationAllowed(venueId, branchId);
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, venueId },
  });

  if (!branch) {
    throw new HttpError(404, 'errors.branchNotFound');
  }

  return prisma.$transaction(async (tx) => {
    await tx.branch.updateMany({
      where: { venueId },
      data: { isMain: false },
    });

    return tx.branch.update({
      where: { id: branchId },
      data: { isMain: true, active: true },
    });
  });
}

export async function deleteBranch(session: SessionPayload | undefined, branchId: string) {
  const { venueId } = await requireVenueAdmin(session);
  await assertVenueCanMutate(venueId);
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, venueId },
    include: {
      menu: {
        include: {
          categories: {
            include: {
              items: {
                select: { imageUrl: true },
              },
            },
          },
        },
      },
    },
  });

  if (!branch) {
    throw new HttpError(404, 'errors.branchNotFound');
  }

  if (branch.active) {
    const activeBranchCount = await prisma.branch.count({
      where: {
        venueId,
        active: true,
        NOT: { id: branchId },
      },
    });

    if (activeBranchCount === 0) {
      throw new HttpError(400, 'errors.lastActiveBranch');
    }
  }

  if (branch.isMain) {
    const replacement = await prisma.branch.findFirst({
      where: {
        venueId,
        id: { not: branchId },
      },
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    });

    if (!replacement) {
      throw new HttpError(400, 'errors.mainBranchRequired');
    }

    await prisma.$transaction([
      prisma.branch.delete({ where: { id: branchId } }),
      prisma.branch.update({ where: { id: replacement.id }, data: { isMain: true, active: true } }),
    ]);

    await deleteImagesByUrl([
      branch.logoUrl,
      branch.coverUrl,
      ...(branch.menu?.categories.map((category) => category.imageUrl) ?? []),
      ...(branch.menu?.categories.flatMap((category) =>
        category.items.map((item) => item.imageUrl),
      ) ?? []),
    ]);

    return { deleted: true };
  }

  await prisma.branch.delete({ where: { id: branchId } });
  await deleteImagesByUrl([
    branch.logoUrl,
    branch.coverUrl,
    ...(branch.menu?.categories.map((category) => category.imageUrl) ?? []),
    ...(branch.menu?.categories.flatMap((category) =>
      category.items.map((item) => item.imageUrl),
    ) ?? []),
  ]);
  return { deleted: true };
}
