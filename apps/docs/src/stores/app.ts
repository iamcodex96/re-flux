import { defineStore } from 'pinia';
import en from '../locales/en.json';

const LOCALE_REFERENCE_PREFIX = '@ref:';

type LocaleRecord = Record<string, unknown>;

/** Resolve @ref:app.view.common.* aliases once so copy is authored only once in locale JSON. */
function resolveLocaleReferences<T>(locale: T): T {
  const root = locale as unknown as LocaleRecord;

  function getPath(path: string): unknown {
    let value: unknown = root;
    for (const segment of path.split('.')) {
      if (!value || typeof value !== 'object' || !(segment in value)) {
        throw new Error(`Unknown locale reference: ${LOCALE_REFERENCE_PREFIX}${path}`);
      }
      value = (value as LocaleRecord)[segment];
    }
    return value;
  }

  function resolve(value: unknown, activeReferences: string[] = []): unknown {
    if (typeof value === 'string' && value.startsWith(LOCALE_REFERENCE_PREFIX)) {
      const path = value.slice(LOCALE_REFERENCE_PREFIX.length);
      if (activeReferences.includes(path)) {
        throw new Error(`Circular locale reference: ${[...activeReferences, path].join(' -> ')}`);
      }
      const target = getPath(path);
      if (typeof target !== 'string') {
        throw new Error(`Locale reference must resolve to text: ${LOCALE_REFERENCE_PREFIX}${path}`);
      }
      return resolve(target, [...activeReferences, path]);
    }
    if (Array.isArray(value)) return value.map((item) => resolve(item, activeReferences));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item, activeReferences)]));
    }
    return value;
  }

  return resolve(locale) as T;
}

const locales = { en: resolveLocaleReferences(en) } as const;
export type AppLocale = keyof typeof locales;

/** Locale content lives in JSON; Pinia provides active app copy to views and components. */
export const useAppStore = defineStore('app', {
  state: () => ({ locale: 'en' as AppLocale }),
  getters: { app: (state) => locales[state.locale].app },
});
