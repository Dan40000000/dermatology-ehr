import { useTranslation } from 'react-i18next';
import { EmptyState } from '../components/ui/EmptyState';
import { LanguagePreferenceSettings } from '../components/LanguagePreferenceSettings';

const actionStyle = { minHeight: '44px', minWidth: '140px' };

export function PreferencesPage() {
  const { t } = useTranslation(['common', 'admin']);

  return (
    <div className="content-card">
      <div className="section-header">
        <div>
          <div className="eyebrow">{t('common:navigation.settings')}</div>
          <h1>{t('admin:settings.preferences')}</h1>
          <p className="muted">Personalize defaults, notifications, and display settings.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" className="ghost" style={actionStyle}>
            Reset Defaults
          </button>
          <button type="button" style={actionStyle}>
            Save Preferences
          </button>
        </div>
      </div>
      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <LanguagePreferenceSettings variant="card" />

        <EmptyState
          title="No preferences configured"
          description="Configure defaults to speed up documentation and scheduling."
        />
      </div>
    </div>
  );
}
