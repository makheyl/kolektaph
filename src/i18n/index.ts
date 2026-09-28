import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import fil from './locales/fil.json';

export const resources = { fil: { translation: fil }, en: { translation: en } } as const;

const i18n = createInstance();

// Filipino first: Carmona residents are the primary audience. English is a toggle.
void i18n.use(initReactI18next).init({
  resources,
  lng: 'fil',
  fallbackLng: 'fil',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
