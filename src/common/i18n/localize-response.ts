import { resolveLocalizedText, type LocalizedText } from './localized-text';

const localizedFieldNames = new Set(['name', 'description', 'address']);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isLocalizedText(value: unknown): value is LocalizedText {
  return (
    isPlainRecord(value) &&
    Object.values(value).length > 0 &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

export function localizeResponse<T>(value: T, locale = 'en', defaultLocale = 'en'): T {
  if (Array.isArray(value)) {
    return value.map((item) => localizeResponse(item, locale, defaultLocale)) as T;
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  const nextDefaultLocale = typeof value.defaultLocale === 'string' ? value.defaultLocale : defaultLocale;

  Object.entries(value).forEach(([key, entry]) => {
    if (localizedFieldNames.has(key)) {
      next[key] = entry === null ? null : isLocalizedText(entry) ? resolveLocalizedText(entry, {
        requestedLocale: locale,
        defaultLocale: nextDefaultLocale,
      }) : entry;
      return;
    }

    next[key] = localizeResponse(entry, locale, nextDefaultLocale);
  });

  return next as T;
}
