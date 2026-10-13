import { defineStore } from 'pinia';
import en from '../locales/en.json';

const locales = { en } as const;
export type AppLocale = keyof typeof locales;

/** Locale content lives in JSON; Pinia provides active app copy to views and components. */
export const useAppStore = defineStore('app', {
  state: () => ({ locale: 'en' as AppLocale }),
  getters: { app: (state) => locales[state.locale].app },
});
