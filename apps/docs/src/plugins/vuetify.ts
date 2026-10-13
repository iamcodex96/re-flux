import { createVuetify } from 'vuetify';

/** Brand colors live here; CSS aliases are derived from Vuetify's generated theme variables. */
const rxDarkTheme = {
  dark: true,
  colors: {
    background: '#10131d',
    surface: '#171b29',
    'surface-bright': '#242a3a',
    'surface-variant': '#202638',
    'surface-sunken': '#0d1018',
    primary: '#a99bff',
    'primary-strong': '#8877ff',
    secondary: '#72e0d1',
    error: '#ff9eab',
    info: '#91a4ff',
    success: '#72e0d1',
    warning: '#ffba81',
    'on-background': '#eef0f7',
    'on-surface': '#eef0f7',
    'on-surface-variant': '#c5cad9',
    'on-surface-sunken': '#eef0f7',
    'on-primary': '#171626',
    'on-primary-strong': '#171626',
    'on-secondary': '#10131d',
    'on-error': '#251116',
    'on-info': '#101426',
    'on-success': '#10131d',
    'on-warning': '#24160c',
  },
  variables: {
    'border-color': '#757986',
    'border-opacity': 1,
    'high-emphasis-opacity': 0.96,
    'medium-emphasis-opacity': 0.82,
    'disabled-opacity': 0.48,
    'focus-opacity': 0.18,
    'hover-opacity': 0.08,
    'selected-opacity': 0.14,
    'pressed-opacity': 0.16,
    'shadow-color': '#05070d',
  },
};

const rxLightTheme = {
  dark: false,
  colors: {
    background: '#f7f8fc',
    surface: '#ffffff',
    'surface-bright': '#ffffff',
    'surface-variant': '#eceef6',
    'surface-sunken': '#eff1f8',
    primary: '#5c4ac7',
    'primary-strong': '#4032a3',
    secondary: '#087e78',
    error: '#b42332',
    info: '#3156b6',
    success: '#176d48',
    warning: '#8a4300',
    'on-background': '#171b29',
    'on-surface': '#171b29',
    'on-surface-variant': '#34394a',
    'on-surface-sunken': '#171b29',
    'on-primary': '#ffffff',
    'on-primary-strong': '#ffffff',
    'on-secondary': '#ffffff',
    'on-error': '#ffffff',
    'on-info': '#ffffff',
    'on-success': '#ffffff',
    'on-warning': '#ffffff',
  },
  variables: {
    'border-color': '#80828a',
    'border-opacity': 1,
    'high-emphasis-opacity': 0.92,
    'medium-emphasis-opacity': 0.82,
    'disabled-opacity': 0.48,
    'focus-opacity': 0.16,
    'hover-opacity': 0.06,
    'selected-opacity': 0.10,
    'pressed-opacity': 0.12,
    'shadow-color': '#252944',
  },
};

export const vuetify = createVuetify({
  theme: {
    defaultTheme: 'rxDark',
    themes: {
      rxDark: rxDarkTheme,
      rxLight: rxLightTheme,
    },
  },
  icons: {
    defaultSet: 'mdi',
  },
  defaults: {
    VBtn: {
      rounded: 'lg',
      elevation: 0,
      minHeight: 40,
      minWidth: 40,
    },
    VCard: {
      rounded: 'lg',
    },
    VTextField: {
      variant: 'outlined',
      density: 'comfortable',
    },
    VSelect: {
      variant: 'outlined',
      density: 'comfortable',
    },
    VSlider: {
      color: 'primary',
      thumbSize: 20,
      trackSize: 5,
    },
    VSwitch: {
      color: 'primary',
      density: 'comfortable',
    },
  },
});
