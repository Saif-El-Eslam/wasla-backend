import { z } from 'zod';

const booleanQueryParam = z.preprocess((value) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }

  return value;
}, z.boolean().optional());

export const paginationQuerySchema = z.object({
  paginate: booleanQueryParam.default(true),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type PaginationOptions = z.infer<typeof paginationQuerySchema> & {
  skip: number;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export function buildPaginationOptions(query: unknown): PaginationOptions {
  const parsed = paginationQuerySchema.parse(query);

  return {
    ...parsed,
    skip: (parsed.page - 1) * parsed.limit,
  };
}

export function buildPaginationMeta(total: number, options: PaginationOptions): PaginationMeta {
  const totalPages = Math.max(Math.ceil(total / options.limit), 1);

  return {
    page: options.page,
    limit: options.limit,
    total,
    totalPages,
    hasNextPage: options.page < totalPages,
    hasPreviousPage: options.page > 1,
  };
}
