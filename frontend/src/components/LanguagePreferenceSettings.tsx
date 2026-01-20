import { useTranslation } from 'react-i18next';
import { useLanguagePreference } from '../hooks/useLanguagePreference';

const LANGUAGE_OPTIONS = [
  { code: 'en', name: 'English', flag: '🇺🇸', nativeName: 'English' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸', nativeName: 'Español' },
  { code: 'fr', name: 'French', flag: '🇫🇷', nativeName: 'Français' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳', nativeName: '中文' },
];

interface LanguagePreferenceSettingsProps {
  /** Show as full card with header, or minimal inline selector */
  variant?: 'card' | 'inline';
}

/**
 * Language preference settings component
 * Can be used in:
 * - User preferences/settings page
 * - User profile page
 * - Admin settings for default organization language
 */
export function LanguagePreferenceSettings({ variant = 'card' }: LanguagePreferenceSettingsProps) {
  const { t } = useTranslation(['common', 'admin']);
  const { currentLanguage, setLanguage } = useLanguagePreference();

  const handleLanguageChange = async (languageCode: string) => {
    try {
      await setLanguage(languageCode);
      // Optionally show success message
      console.log(`Language changed to: ${languageCode}`);
    } catch (error) {
      console.error('Failed to change language:', error);
      // Optionally show error toast
    }
  };

  if (variant === 'inline') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label
          htmlFor="language-select"
          style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: '#374151',
          }}
        >
          {t('admin:settings.language')}
        </label>
        <select
          id="language-select"
          value={currentLanguage}
          onChange={(e) => handleLanguageChange(e.target.value)}
          style={{
            padding: '0.5rem 2rem 0.5rem 0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid #d1d5db',
            fontSize: '0.875rem',
            backgroundColor: 'white',
            cursor: 'pointer',
          }}
        >
          {LANGUAGE_OPTIONS.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.flag} {lang.nativeName} ({lang.name})
            </option>
          ))}
        </select>
        <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
          {t('common:messages.saved')} ✓
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
      }}
    >
      <div style={{ marginBottom: '1.5rem' }}>
        <h3
          style={{
            fontSize: '1.125rem',
            fontWeight: 700,
            color: '#111827',
            marginBottom: '0.5rem',
          }}
        >
          {t('admin:settings.language')}
        </h3>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
          Choose your preferred language for the application interface
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: '1rem',
        }}
      >
        {LANGUAGE_OPTIONS.map((lang) => {
          const isSelected = currentLanguage === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => handleLanguageChange(lang.code)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem',
                borderRadius: '0.5rem',
                border: isSelected ? '2px solid #8b5cf6' : '2px solid #e5e7eb',
                background: isSelected ? '#f5f3ff' : 'white',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.background = '#f9fafb';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.background = 'white';
                }
              }}
            >
              <span style={{ fontSize: '2rem' }}>{lang.flag}</span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: isSelected ? '#6b21a8' : '#111827',
                  }}
                >
                  {lang.nativeName}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  {lang.name}
                </div>
              </div>
              {isSelected && (
                <span style={{ color: '#8b5cf6', fontSize: '1.5rem' }}>✓</span>
              )}
            </button>
          );
        })}
      </div>

      <div
        style={{
          marginTop: '1.5rem',
          padding: '1rem',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '0.5rem',
        }}
      >
        <p style={{ fontSize: '0.875rem', color: '#15803d', margin: 0 }}>
          <strong>Note:</strong> Your language preference is saved automatically and will be
          applied across all your sessions.
        </p>
      </div>
    </div>
  );
}
