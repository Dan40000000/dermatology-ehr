import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import English translations
import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enPatients from './locales/en/patients.json';
import enAppointments from './locales/en/appointments.json';
import enClinical from './locales/en/clinical.json';
import enBilling from './locales/en/billing.json';
import enAdmin from './locales/en/admin.json';
import enErrors from './locales/en/errors.json';
import enValidation from './locales/en/validation.json';

// Import Spanish translations
import esCommon from './locales/es/common.json';
import esAuth from './locales/es/auth.json';
import esPatients from './locales/es/patients.json';
import esAppointments from './locales/es/appointments.json';
import esClinical from './locales/es/clinical.json';
import esBilling from './locales/es/billing.json';
import esAdmin from './locales/es/admin.json';
import esErrors from './locales/es/errors.json';
import esValidation from './locales/es/validation.json';

// Import French translations
import frCommon from './locales/fr/common.json';
import frAuth from './locales/fr/auth.json';
import frPatients from './locales/fr/patients.json';
import frAppointments from './locales/fr/appointments.json';
import frClinical from './locales/fr/clinical.json';
import frBilling from './locales/fr/billing.json';
import frAdmin from './locales/fr/admin.json';
import frErrors from './locales/fr/errors.json';
import frValidation from './locales/fr/validation.json';

// Import Chinese translations
import zhCommon from './locales/zh/common.json';
import zhAuth from './locales/zh/auth.json';
import zhPatients from './locales/zh/patients.json';
import zhAppointments from './locales/zh/appointments.json';
import zhClinical from './locales/zh/clinical.json';
import zhBilling from './locales/zh/billing.json';
import zhAdmin from './locales/zh/admin.json';
import zhErrors from './locales/zh/errors.json';
import zhValidation from './locales/zh/validation.json';

const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    patients: enPatients,
    appointments: enAppointments,
    clinical: enClinical,
    billing: enBilling,
    admin: enAdmin,
    errors: enErrors,
    validation: enValidation,
  },
  es: {
    common: esCommon,
    auth: esAuth,
    patients: esPatients,
    appointments: esAppointments,
    clinical: esClinical,
    billing: esBilling,
    admin: esAdmin,
    errors: esErrors,
    validation: esValidation,
  },
  fr: {
    common: frCommon,
    auth: frAuth,
    patients: frPatients,
    appointments: frAppointments,
    clinical: frClinical,
    billing: frBilling,
    admin: frAdmin,
    errors: frErrors,
    validation: frValidation,
  },
  zh: {
    common: zhCommon,
    auth: zhAuth,
    patients: zhPatients,
    appointments: zhAppointments,
    clinical: zhClinical,
    billing: zhBilling,
    admin: zhAdmin,
    errors: zhErrors,
    validation: zhValidation,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    defaultNS: 'common',
    fallbackLng: 'en',
    supportedLngs: ['en', 'es', 'fr', 'zh'],

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },

    react: {
      useSuspense: false,
    },
  });

export default i18n;
