import arMessages from './messages/ar.json';
import enMessages from './messages/en.json';

interface MessageTree {
  [key: string]: string | MessageTree;
}

const messages: Record<string, MessageTree> = {
  ar: arMessages,
  en: enMessages,
};

export const supportedLocales = Object.keys(messages);
export const defaultLocale = 'en';

export function normalizeLocale(locale?: string | null) {
  if (!locale) {
    return defaultLocale;
  }

  const normalized = locale.toLowerCase().split('-')[0];
  return supportedLocales.includes(normalized) ? normalized : defaultLocale;
}

function readMessage(tree: MessageTree, key: string): string | undefined {
  return key.split('.').reduce<string | MessageTree | undefined>((current, segment) => {
    if (!current || typeof current === 'string') {
      return undefined;
    }

    return current[segment];
  }, tree) as string | undefined;
}

export function translate(
  locale: string | undefined,
  key: string,
  values: Record<string, string | number> = {},
) {
  const normalizedLocale = normalizeLocale(locale);
  const message = readMessage(messages[normalizedLocale], key) ?? readMessage(messages[defaultLocale], key) ?? key;

  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{{${name}}}`, String(value)),
    message,
  );
}
