import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
];

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLanguage = LANGUAGES.find(lang => lang.code === i18n.language) || LANGUAGES[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const changeLanguage = async (languageCode: string) => {
    await i18n.changeLanguage(languageCode);
    localStorage.setItem('i18nextLng', languageCode);
    setIsOpen(false);
  };

  return (
    <div className="language-switcher" ref={dropdownRef}>
      <button
        type="button"
        className="language-switcher-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('languages.changeLanguage')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          background: 'rgba(255, 255, 255, 0.15)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '4px',
          color: 'white',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: 500,
        }}
      >
        <span style={{ fontSize: '1.25rem' }}>{currentLanguage.flag}</span>
        <span>{currentLanguage.code.toUpperCase()}</span>
        <span style={{ fontSize: '0.75rem' }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div
          className="language-switcher-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.5rem)',
            right: 0,
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            zIndex: 1000,
            minWidth: '180px',
            overflow: 'hidden',
          }}
        >
          {LANGUAGES.map((language) => (
            <button
              key={language.code}
              type="button"
              onClick={() => changeLanguage(language.code)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                border: 'none',
                background: currentLanguage.code === language.code ? '#f3f4f6' : 'transparent',
                color: '#374151',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: currentLanguage.code === language.code ? 600 : 400,
                textAlign: 'left',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (currentLanguage.code !== language.code) {
                  e.currentTarget.style.background = '#f9fafb';
                }
              }}
              onMouseLeave={(e) => {
                if (currentLanguage.code !== language.code) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>{language.flag}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{language.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {language.code.toUpperCase()}
                </div>
              </div>
              {currentLanguage.code === language.code && (
                <span style={{ color: '#10b981', fontSize: '1.25rem' }}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}

      <style>{`
        .language-switcher {
          position: relative;
        }

        .language-switcher-button:hover {
          background: rgba(255, 255, 255, 0.25) !important;
        }

        .language-switcher-button:focus {
          outline: 2px solid rgba(255, 255, 255, 0.5);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
}
