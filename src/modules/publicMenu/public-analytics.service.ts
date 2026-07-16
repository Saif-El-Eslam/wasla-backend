import { AnalyticsEventType } from '@prisma/client';
import { prisma } from '../../database/prisma';
import type { z } from 'zod';
import type { publicAnalyticsEventSchema } from './public.schemas';

export async function recordPublicAnalytics(input: z.infer<typeof publicAnalyticsEventSchema>) {
  try {
    const venue = await prisma.venue.findUnique({
      where: { id: input.venueId },
      select: { id: true },
    });

    if (!venue) {
      return { tracked: false };
    }

    const branch = input.branchId
      ? await prisma.branch.findFirst({
          where: { id: input.branchId, venueId: input.venueId, active: true },
          select: { id: true },
        })
      : await prisma.branch.findFirst({
          where: { venueId: input.venueId, active: true },
          orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
          select: { id: true },
        });

    if (!branch) {
      return { tracked: false };
    }

    const menu = input.menuId
      ? await prisma.menu.findFirst({
          where: { id: input.menuId, branchId: branch.id },
          select: { id: true, publishedAt: true },
        })
      : await prisma.menu.findUnique({
          where: { branchId: branch.id },
          select: { id: true, publishedAt: true },
        });

    if (input.eventType !== AnalyticsEventType.VENUE_VIEW && !menu?.publishedAt) {
      return { tracked: false };
    }

    const category = input.categoryId
      ? await prisma.menuCategory.findFirst({
          where: { id: input.categoryId, menuId: menu?.id, active: true },
          select: { id: true },
        })
      : null;

    if (input.categoryId && !category) {
      return { tracked: false };
    }

    const item = input.itemId
      ? await prisma.menuItem.findFirst({
          where: {
            id: input.itemId,
            categoryId: category?.id,
            available: true,
          },
          select: { id: true },
        })
      : null;

    if (input.itemId && !item) {
      return { tracked: false };
    }

    await prisma.analyticsEventLog.create({
      data: {
        venueId: input.venueId,
        branchId: branch.id,
        menuId: menu?.id ?? null,
        categoryId: category?.id ?? null,
        itemId: item?.id ?? null,
        eventType: input.eventType,
      },
    });
    return { tracked: true };
  } catch (error) {
    console.warn('[analytics] public event skipped', error);
    return { tracked: false };
  }
}
