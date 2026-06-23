import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { HttpError } from '../http/http-error';

export type SessionPayload = {
  sub: string;
  venueId?: string;
  role?: string;
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[env.COOKIE_NAME];

  if (!token || typeof token !== 'string') {
    next(new HttpError(401, 'errors.authRequired'));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as SessionPayload;
    req.user = payload;
    next();
  } catch {
    next(new HttpError(401, 'errors.invalidSession'));
  }
};
