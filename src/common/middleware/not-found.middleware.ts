import type { RequestHandler } from 'express';
import { HttpError } from '../http/http-error';

export const notFoundMiddleware: RequestHandler = (req, _res, next) => {
  next(
    new HttpError(404, 'errors.routeNotFound', undefined, {
      method: req.method,
      path: req.originalUrl,
    }),
  );
};
