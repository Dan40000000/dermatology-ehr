import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Hook to sync language preference with user settings
 * This hook automatically:
 * - Loads the user's language preference from localStorage on mount
 * - Syncs language changes to localStorage
 * - Can be extended to sync with backend user preferences
 */
export function useLanguagePreference() {
  const { i18n } = useTranslation();

  useEffect(() => {
    // Load saved language preference
    const savedLanguage = localStorage.getItem('i18nextLng');
    if (savedLanguage && savedLanguage !== i18n.language) {
      i18n.changeLanguage(savedLanguage);
    }
  }, [i18n]);

  const setLanguage = async (languageCode: string) => {
    await i18n.changeLanguage(languageCode);
    localStorage.setItem('i18nextLng', languageCode);

    // TODO: Sync with backend user preferences
    // Example:
    // try {
    //   await updateUserPreference({ language: languageCode });
    // } catch (error) {
    //   console.error('Failed to save language preference:', error);
    // }
  };

  return {
    currentLanguage: i18n.language,
    setLanguage,
    supportedLanguages: ['en', 'es', 'fr', 'zh'],
  };
}
