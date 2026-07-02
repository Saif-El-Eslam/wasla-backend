import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { HttpError } from '../../common/http/http-error';
import { buildPaginationMeta, type PaginationOptions } from '../../common/pagination/pagination';
import type { z } from 'zod';
import type { publicVenueListQuerySchema } from './public.schemas';

const publicVenueSelect = Prisma.validator<Prisma.VenueSelect>()({
  id: true,
  type: true,
  name: true,
  slug: true,
  logoUrl: true,
  coverUrl: true,
  phone: true,
  whatsapp: true,
  address: true,
  googleMapsUrl: true,
  instagramUrl: true,
  facebookUrl: true,
  description: true,
  defaultLocale: true,
  supportedLocales: true,
  timezone: true,
  currency: true,
  _count: {
    select: {
      branches: { where: { active: true } },
    },
  },
  branches: {
    where: { active: true },
    select: {
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
      instagramUrl: true,
      facebookUrl: true,
      openingHours: true,
      menu: {
        select: {
          id: true,
          publishedAt: true,
          categories: {
            where: { active: true },
            select: {
              id: true,
              _count: {
                select: {
                  items: { where: { available: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
  },
});

type PublicVenueRecord = Prisma.VenueGetPayload<{ select: typeof publicVenueSelect }>;
type PublicBranchRecord = PublicVenueRecord['branches'][number];

function buildVenueSearchWhere(query: z.infer<typeof publicVenueListQuerySchema>): Prisma.VenueWhereInput {
  const filters: Prisma.VenueWhereInput[] = [];

  if (query.type) {
    filters.push({ type: query.type });
  }

  if (query.search) {
    const branchSearch: Prisma.BranchWhereInput = {
      active: true,
      OR: [
        { slug: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { whatsapp: { contains: query.search, mode: 'insensitive' } },
        { name: { path: ['en'], string_contains: query.search, mode: 'insensitive' } },
        { name: { path: ['ar'], string_contains: query.search, mode: 'insensitive' } },
        { address: { path: ['en'], string_contains: query.search, mode: 'insensitive' } },
        { address: { path: ['ar'], string_contains: query.search, mode: 'insensitive' } },
      ],
    };

    filters.push({
      OR: [
        { slug: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { whatsapp: { contains: query.search, mode: 'insensitive' } },
        { name: { path: ['en'], string_contains: query.search, mode: 'insensitive' } },
        { name: { path: ['ar'], string_contains: query.search, mode: 'insensitive' } },
        { description: { path: ['en'], string_contains: query.search, mode: 'insensitive' } },
        { description: { path: ['ar'], string_contains: query.search, mode: 'insensitive' } },
        { address: { path: ['en'], string_contains: query.search, mode: 'insensitive' } },
        { address: { path: ['ar'], string_contains: query.search, mode: 'insensitive' } },
        { branches: { some: branchSearch } },
      ],
    });
  }

  return {
    AND: [{ branches: { some: { active: true } } }, ...filters],
  };
}

function compactPublicBranch(branch: PublicBranchRecord) {
  const itemCount =
    branch.menu?.categories.reduce((sum, category) => sum + category._count.items, 0) ?? 0;

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
    instagramUrl: branch.instagramUrl,
    facebookUrl: branch.facebookUrl,
    openingHours: branch.openingHours,
    menuId: branch.menu?.id ?? null,
    publishedAt: branch.menu?.publishedAt ?? null,
    stats: {
      categories: branch.menu?.categories.length ?? 0,
      items: itemCount,
    },
  };
}

function compactPublicVenue(venue: PublicVenueRecord) {
  return {
    id: venue.id,
    type: venue.type,
    name: venue.name,
    slug: venue.slug,
    logoUrl: venue.logoUrl,
    coverUrl: venue.coverUrl,
    phone: venue.phone,
    whatsapp: venue.whatsapp,
    address: venue.address,
    googleMapsUrl: venue.googleMapsUrl,
    instagramUrl: venue.instagramUrl,
    facebookUrl: venue.facebookUrl,
    description: venue.description,
    defaultLocale: venue.defaultLocale,
    supportedLocales: venue.supportedLocales,
    timezone: venue.timezone,
    currency: venue.currency,
    branchCount: venue._count.branches,
    branches: venue.branches.map(compactPublicBranch),
  };
}

export async function listPublicVenues(
  query: z.infer<typeof publicVenueListQuerySchema>,
  pagination: PaginationOptions,
) {
  const where = buildVenueSearchWhere(query);
  const [venues, total] = await prisma.$transaction([
    prisma.venue.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
      select: publicVenueSelect,
    }),
    prisma.venue.count({ where }),
  ]);

  return {
    venues: venues.map(compactPublicVenue),
    pagination: buildPaginationMeta(total, pagination),
    filters: {
      search: query.search ?? '',
      type: query.type ?? null,
    },
  };
}

export async function getPublicVenue(venueSlug: string) {
  const venue = await prisma.venue.findUnique({
    where: { slug: venueSlug },
    select: publicVenueSelect,
  });

  if (!venue) {
    throw new HttpError(404, 'errors.venueNotFound');
  }

  const compactVenue = compactPublicVenue(venue);

  return {
    venue: compactVenue,
    branches: compactVenue.branches,
  };
}
