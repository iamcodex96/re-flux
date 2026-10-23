export const LOCALE_REFERENCE_PREFIX = '@ref:';

/** Resolve locale references such as @ref:app.view.common.actions.play. */
export function resolveLocaleReferences(locale) {
  function getPath(path) {
    const segments = path.split('.');
    let value = locale;

    for (const segment of segments) {
      if (value === null || typeof value !== 'object' || !(segment in value)) {
        throw new Error(`Unknown locale reference: ${LOCALE_REFERENCE_PREFIX}${path}`);
      }
      value = value[segment];
    }

    return value;
  }

  function resolve(value, activeReferences = []) {
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

    if (Array.isArray(value)) {
      return value.map((item) => resolve(item, activeReferences));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, resolve(item, activeReferences)]),
      );
    }

    return value;
  }

  return resolve(locale);
}
