import type { RequestHandler } from 'express';
import { buildPaginationOptions } from '../pagination/pagination';

export const paginationMiddleware: RequestHandler = (req, _res, next) => {
  try {
    req.pagination = buildPaginationOptions(req.query);
    next();
  } catch (error) {
    next(error);
  }
};
