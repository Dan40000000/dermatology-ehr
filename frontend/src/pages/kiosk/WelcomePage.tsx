import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KioskLayout } from '../../components/kiosk/KioskLayout';

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
      subtitle: 'Gracias por elegir nuestra práctica de dermatología',
      checkIn: 'Registrarse',
      instructions: 'Toque el botón a continuación para comenzar su registro',
      language: 'Idioma',
    },
  };

  const t = text[language];

  return (
    <KioskLayout showProgress={false}>
      <div className="bg-white rounded-2xl shadow-2xl p-12 text-center">
        {/* Logo/Icon */}
        <div className="flex justify-center mb-8">
          <div className="w-32 h-32 bg-gradient-to-br from-purple-600 to-purple-700 rounded-full flex items-center justify-center shadow-lg">
            <svg className="w-20 h-20 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <h1 className="text-5xl font-bold text-gray-900 mb-4">{t.title}</h1>
        <p className="text-2xl text-gray-600 mb-12">{t.subtitle}</p>

        {/* Check-in button */}
        <button
          onClick={handleStartCheckIn}
          className="w-full max-w-md mx-auto bg-gradient-to-r from-purple-600 to-purple-700 text-white text-3xl font-bold py-8 px-12 rounded-2xl shadow-xl hover:shadow-2xl hover:from-purple-700 hover:to-purple-800 transform hover:scale-105 transition-all duration-200 mb-8"
        >
          {t.checkIn}
        </button>

        <p className="text-xl text-gray-500 mb-12">{t.instructions}</p>

        {/* Language selector */}
        <div className="flex items-center justify-center gap-4">
          <span className="text-lg text-gray-600">{t.language}:</span>
          <button
            onClick={() => setLanguage('en')}
            className={`px-6 py-3 text-lg font-medium rounded-lg transition-all ${
              language === 'en'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            English
          </button>
          <button
            onClick={() => setLanguage('es')}
            className={`px-6 py-3 text-lg font-medium rounded-lg transition-all ${
              language === 'es'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Español
          </button>
        </div>

        {/* Help text */}
        <div className="mt-12 p-6 bg-purple-50 rounded-lg border-2 border-purple-200">
          <p className="text-lg text-purple-800">
            {language === 'en'
              ? 'If you need assistance, please see the front desk staff.'
              : 'Si necesita ayuda, consulte al personal de recepción.'}
          </p>
        </div>
      </div>
    </KioskLayout>
  );
}
