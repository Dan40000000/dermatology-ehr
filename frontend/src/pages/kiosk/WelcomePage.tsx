import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KioskLayout } from '../../components/kiosk/KioskLayout';
import '../../styles/kiosk.css';

export function KioskWelcomePage() {
  const navigate = useNavigate();
  const [language, setLanguage] = useState<'en' | 'es'>('en');

  // Auto-reset to welcome page after timeout
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setLanguage('en'); // Reset language
    }, 60000); // 1 minute of inactivity on welcome page

    return () => clearTimeout(timeoutId);
  }, []);

  const handleStartCheckIn = () => {
    navigate('/kiosk/verify');
  };

  const text = {
    en: {
      title: 'Welcome',
      subtitle: 'Thank you for choosing our dermatology practice',
      checkIn: 'Check In',
      instructions: 'Tap the button below to begin your check-in',
      language: 'Language',
    },
    es: {
      title: 'Bienvenido',
      subtitle: 'Gracias por elegir nuestra practica de dermatologia',
      checkIn: 'Registrarse',
      instructions: 'Toque el boton a continuacion para comenzar su registro',
      language: 'Idioma',
    },
  };

  const t = text[language];

  return (
    <KioskLayout showProgress={false}>
      <div className="kiosk-welcome-card">
        {/* Logo/Icon */}
        <div className="kiosk-welcome-icon-container">
          <div className="kiosk-welcome-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
        </div>

        {/* Welcome text */}
        <h1 className="kiosk-welcome-title">{t.title}</h1>
        <p className="kiosk-welcome-subtitle">{t.subtitle}</p>

        {/* Check-in button */}
        <button onClick={handleStartCheckIn} className="kiosk-checkin-btn">
          {t.checkIn}
        </button>

        <p className="kiosk-instructions">{t.instructions}</p>

        {/* Language selector */}
        <div className="kiosk-language-selector">
          <span className="kiosk-language-label">{t.language}:</span>
          <button
            onClick={() => setLanguage('en')}
            className={`kiosk-language-btn ${language === 'en' ? 'active' : ''}`}
          >
            English
          </button>
          <button
            onClick={() => setLanguage('es')}
            className={`kiosk-language-btn ${language === 'es' ? 'active' : ''}`}
          >
            Espanol
          </button>
        </div>

        {/* Help text */}
        <div className="kiosk-help-box">
          <p>
            {language === 'en'
              ? 'If you need assistance, please see the front desk staff.'
              : 'Si necesita ayuda, consulte al personal de recepcion.'}
          </p>
        </div>
      </div>
    </KioskLayout>
  );
}
