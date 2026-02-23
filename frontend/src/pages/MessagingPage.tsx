import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MailPage } from './MailPage';
import { DirectMessagingPage } from './DirectMessagingPage';

type MessagingSection = 'mail' | 'direct';

function sectionFromPath(pathname: string): MessagingSection {
  return pathname.startsWith('/direct') ? 'direct' : 'mail';
}

export function MessagingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeSection = useMemo(() => sectionFromPath(location.pathname), [location.pathname]);

  return (
    <div className="analytics-page">
      <div className="page-header">
        <h1>Messaging Hub</h1>
      </div>

      <div className="analytics-tabs" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          className={`analytics-tab ${activeSection === 'mail' ? 'active' : ''}`}
          onClick={() => navigate('/mail')}
          aria-pressed={activeSection === 'mail'}
        >
          <strong>Mail</strong>
        </button>
        <button
          type="button"
          className={`analytics-tab ${activeSection === 'direct' ? 'active' : ''}`}
          onClick={() => navigate('/direct')}
          aria-pressed={activeSection === 'direct'}
        >
          <strong>Direct Secure Messaging</strong>
        </button>
      </div>

      {activeSection === 'mail' ? <MailPage /> : <DirectMessagingPage />}
    </div>
  );
}
