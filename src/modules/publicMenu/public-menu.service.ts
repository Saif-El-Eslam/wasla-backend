import { AnalyticsEventType, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { HttpError } from '../../common/http/http-error';
import { recordPublicAnalytics } from './public-analytics.service';

const publicMenuInclude = Prisma.validator<Prisma.MenuInclude>()({
  qrCode: true,
  categories: {
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      items: {
        where: { available: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          prices: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  },
});

export async function getPublicBranchMenu(venueSlug: string, branchSlug: string) {
  const branch = await prisma.branch.findFirst({
    where: {
      slug: branchSlug,
      active: true,
      venue: { slug: venueSlug },
    },
    include: {
      venue: true,
      menu: {
        where: { publishedAt: { not: null } },
        include: publicMenuInclude,
      },
    },
  });

  if (!branch) {
    throw new HttpError(404, 'errors.branchNotFound');
  }

  return {
    venue: branch.venue,
    branch: {
      id: branch.id,
      venueId: branch.venueId,
      name: branch.name,
      slug: branch.slug,
      isMain: branch.isMain,
      active: branch.active,
      logoUrl: branch.logoUrl,
      coverUrl: branch.coverUrl,
      phone: branch.phone,
      whatsapp: branch.whatsapp,
      address: branch.address,
      googleMapsUrl: branch.googleMapsUrl,
      instagramUrl: branch.instagramUrl,
      facebookUrl: branch.facebookUrl,
      openingHours: branch.openingHours,
    },
    menu: branch.menu,
  };
}

export async function resolvePublicQrShortCode(code: string) {
  const qrCode = await prisma.menuQrCode.findUnique({
    where: { shortCode: code },
    include: {
      menu: {
        include: {
          branch: {
            include: {
              venue: true,
            },
          },
        },
      },
    },
  });

  if (!qrCode?.menu.branch.active || !qrCode.menu.publishedAt) {
    throw new HttpError(404, 'errors.menuNotFound');
  }

  void recordPublicAnalytics({
    eventType: AnalyticsEventType.QR_SCAN,
    venueId: qrCode.menu.branch.venueId,
    branchId: qrCode.menu.branchId,
    menuId: qrCode.menuId,
  });

  return {
    venueSlug: qrCode.menu.branch.venue.slug,
    branchSlug: qrCode.menu.branch.slug,
  };
}
