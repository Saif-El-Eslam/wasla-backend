export type LocaleCode = 'ar' | 'en' | string;

export type LocalizedText = Record<LocaleCode, string>;

export function resolveLocalizedText(
  value: LocalizedText | null | undefined,
  options: {
    requestedLocale?: string;
    defaultLocale?: string;
  } = {},
) {
  if (!value) {
    return '';
  }

  const localeOrder = [
    options.requestedLocale,
    options.defaultLocale,
    'ar',
    'en',
    ...Object.keys(value),
  ].filter(Boolean) as string[];

  for (const locale of localeOrder) {
    const text = value[locale]?.trim();

    if (text) {
      return text;
    }
  }

  return '';
}
