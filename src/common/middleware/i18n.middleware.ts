import type { RequestHandler } from 'express';
import { normalizeLocale, translate } from '../i18n/i18n';

export const i18nMiddleware: RequestHandler = (req, _res, next) => {
  const queryLocale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
  const headerLocale = req.header('x-locale') ?? req.acceptsLanguages()?.[0];
  const locale = normalizeLocale(queryLocale ?? headerLocale);

  req.locale = locale;
  req.t = (key, values) => translate(locale, key, values);

  next();
};
