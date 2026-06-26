import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { requireBranchAccess } from '../../common/auth/branch-access';
import { HttpError } from '../../common/http/http-error';
import type { SessionPayload } from '../../common/middleware/auth.middleware';
import type { z } from 'zod';
import type {
  createCategorySchema,
  createItemSchema,
  createMenuSchema,
  reorderCategoriesSchema,
  reorderItemsSchema,
  toggleAvailabilitySchema,
  updateCategorySchema,
  updateItemSchema,
  updateMenuSchema,
} from './menu.schemas';

async function requireBranchMenu(session: SessionPayload | undefined, branchId: string) {
  await requireBranchAccess(session, branchId);
  const menu = await prisma.menu.findUnique({
    where: { branchId },
  });

  if (!menu) {
    throw new HttpError(404, 'errors.menuNotFound');
  }

  return menu;
}

async function requireCategory(menuId: string, categoryId: string) {
  const category = await prisma.menuCategory.findFirst({
    where: { id: categoryId, menuId },
  });

  if (!category) {
    throw new HttpError(404, 'errors.categoryNotFound');
  }

  return category;
}

async function requireItem(categoryId: string, itemId: string) {
  const item = await prisma.menuItem.findFirst({
    where: { id: itemId, categoryId },
  });

  if (!item) {
    throw new HttpError(404, 'errors.itemNotFound');
  }

  return item;
}

function buildPriceRows(
  input: z.infer<typeof createItemSchema> | z.infer<typeof updateItemSchema>,
) {
  if (input.prices) {
    return input.prices.map((price, sortOrder) => ({
      label: price.label,
      price: new Prisma.Decimal(price.price),
      sortOrder: price.sortOrder ?? sortOrder,
    }));
  }

  if (input.price !== undefined) {
    return [
      {
        label: 'Regular',
        price: new Prisma.Decimal(input.price),
        sortOrder: 0,
      },
    ];
  }

  return undefined;
}

export async function getBranchMenu(session: SessionPayload | undefined, branchId: string) {
  await requireBranchAccess(session, branchId);

  return prisma.menu.findUnique({
    where: { branchId },
    include: {
      qrCode: true,
      analytics: true,
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
  });
}

export async function createBranchMenu(
  session: SessionPayload | undefined,
  branchId: string,
  input: z.infer<typeof createMenuSchema>,
) {
  await requireBranchAccess(session, branchId);

  return prisma.menu.create({
    data: {
      branchId,
      theme: input.theme,
      showPrices: input.showPrices,
      qrCode: {
        create: {
          shortCode: crypto.randomUUID().slice(0, 8),
        },
      },
      analytics: {
        create: {},
      },
    },
    include: { qrCode: true, analytics: true, categories: { include: { items: true } } },
  });
}

export async function updateBranchMenu(
  session: SessionPayload | undefined,
  branchId: string,
  input: z.infer<typeof updateMenuSchema>,
) {
  const menu = await requireBranchMenu(session, branchId);

  return prisma.menu.update({
    where: { id: menu.id },
    data: input,
    include: {
      qrCode: true,
      analytics: true,
      categories: {
        include: { items: { include: { prices: { orderBy: { sortOrder: 'asc' } } } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
}

export async function deleteBranchMenu(session: SessionPayload | undefined, branchId: string) {
  const menu = await requireBranchMenu(session, branchId);
  await prisma.menu.delete({ where: { id: menu.id } });
  return { deleted: true };
}

export async function publishBranchMenu(session: SessionPayload | undefined, branchId: string) {
  const menu = await requireBranchMenu(session, branchId);

  return prisma.menu.update({
    where: { id: menu.id },
    data: { publishedAt: new Date() },
    include: { qrCode: true, analytics: true },
  });
}

export async function unpublishBranchMenu(session: SessionPayload | undefined, branchId: string) {
  const menu = await requireBranchMenu(session, branchId);

  return prisma.menu.update({
    where: { id: menu.id },
    data: { publishedAt: null },
    include: { qrCode: true, analytics: true },
  });
}

export async function createCategory(
  session: SessionPayload | undefined,
  branchId: string,
  input: z.infer<typeof createCategorySchema>,
) {
  const menu = await requireBranchMenu(session, branchId);
  const sortOrder =
    input.sortOrder ?? (await prisma.menuCategory.count({ where: { menuId: menu.id } }));

  return prisma.menuCategory.create({
    data: {
      menuId: menu.id,
      name: input.name,
      description: input.description,
      imageUrl: input.imageUrl || null,
      sortOrder,
      active: input.active,
    },
    include: { items: true },
  });
}

export async function updateCategory(
  session: SessionPayload | undefined,
  branchId: string,
  categoryId: string,
  input: z.infer<typeof updateCategorySchema>,
) {
  const menu = await requireBranchMenu(session, branchId);
  await requireCategory(menu.id, categoryId);

  return prisma.menuCategory.update({
    where: { id: categoryId },
    data: {
      ...input,
      imageUrl: input.imageUrl === '' ? null : input.imageUrl,
    },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
}

export async function deleteCategory(
  session: SessionPayload | undefined,
  branchId: string,
  categoryId: string,
) {
  const menu = await requireBranchMenu(session, branchId);
  await requireCategory(menu.id, categoryId);
  await prisma.menuCategory.delete({ where: { id: categoryId } });
  return { deleted: true };
}

export async function reorderCategories(
  session: SessionPayload | undefined,
  branchId: string,
  input: z.infer<typeof reorderCategoriesSchema>,
) {
  const menu = await requireBranchMenu(session, branchId);

  await prisma.$transaction(
    input.categoryIds.map((categoryId, sortOrder) =>
      prisma.menuCategory.update({
        where: { id: categoryId, menuId: menu.id },
        data: { sortOrder },
      }),
    ),
  );

  return getBranchMenu(session, branchId);
}

export async function createItem(
  session: SessionPayload | undefined,
  branchId: string,
  categoryId: string,
  input: z.infer<typeof createItemSchema>,
) {
  const menu = await requireBranchMenu(session, branchId);
  await requireCategory(menu.id, categoryId);
  const sortOrder = input.sortOrder ?? (await prisma.menuItem.count({ where: { categoryId } }));
  const priceRows = buildPriceRows(input);

  return prisma.menuItem.create({
    data: {
      categoryId,
      name: input.name,
      description: input.description,
      price: input.price === undefined ? undefined : new Prisma.Decimal(input.price),
      prices: priceRows ? { create: priceRows } : undefined,
      imageUrl: input.imageUrl || null,
      tags: input.tags,
      calories: input.calories,
      available: input.available,
      sortOrder,
    },
    include: {
      prices: { orderBy: { sortOrder: 'asc' } },
    },
  });
}

export async function updateItem(
  session: SessionPayload | undefined,
  branchId: string,
  categoryId: string,
  itemId: string,
  input: z.infer<typeof updateItemSchema>,
) {
  const menu = await requireBranchMenu(session, branchId);
  await requireCategory(menu.id, categoryId);
  await requireItem(categoryId, itemId);
  const priceRows = buildPriceRows(input);

  return prisma.menuItem.update({
    where: { id: itemId },
    data: {
      ...input,
      prices: priceRows
        ? {
            deleteMany: {},
            create: priceRows,
          }
        : undefined,
      price: input.price === undefined ? undefined : new Prisma.Decimal(input.price),
      imageUrl: input.imageUrl === '' ? null : input.imageUrl,
    },
    include: {
      prices: { orderBy: { sortOrder: 'asc' } },
    },
  });
}

export async function deleteItem(
  session: SessionPayload | undefined,
  branchId: string,
  categoryId: string,
  itemId: string,
) {
  const menu = await requireBranchMenu(session, branchId);
  await requireCategory(menu.id, categoryId);
  await requireItem(categoryId, itemId);
  await prisma.menuItem.delete({ where: { id: itemId } });
  return { deleted: true };
}

export async function reorderItems(
  session: SessionPayload | undefined,
  branchId: string,
  categoryId: string,
  input: z.infer<typeof reorderItemsSchema>,
) {
  const menu = await requireBranchMenu(session, branchId);
  await requireCategory(menu.id, categoryId);

  await prisma.$transaction(
    input.itemIds.map((itemId, sortOrder) =>
      prisma.menuItem.update({
        where: { id: itemId, categoryId },
        data: { sortOrder },
      }),
    ),
  );

  return getBranchMenu(session, branchId);
}

export async function toggleItemAvailability(
  session: SessionPayload | undefined,
  branchId: string,
  categoryId: string,
  itemId: string,
  input: z.infer<typeof toggleAvailabilitySchema>,
) {
  const menu = await requireBranchMenu(session, branchId);
  await requireCategory(menu.id, categoryId);
  const item = await requireItem(categoryId, itemId);

  return prisma.menuItem.update({
    where: { id: itemId },
    data: { available: input.available ?? !item.available },
    include: {
      prices: { orderBy: { sortOrder: 'asc' } },
    },
  });
}
