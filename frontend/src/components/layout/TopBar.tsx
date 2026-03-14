import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessModule, type ModuleKey } from '../../config/moduleAccess';
import { HelpModal } from '../HelpModal';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { Modal } from '../ui';
import type { Patient } from '../../types';
import {
  getActiveEncounter,
  clearActiveEncounter,
  subscribeToActiveEncounterChanges,
} from '../../utils/activeEncounter';

interface TopBarProps {
  patients?: Patient[];
  onRefresh?: () => void;
}

type UserPreferences = {
  defaultPage: string;
  defaultScheduleView: 'day' | 'week' | 'month';
  showWeekendsByDefault: boolean;
  itemsPerPage: '10' | '20' | '50' | '100';
  keyboardShortcutsEnabled: boolean;
  showTooltips: boolean;
};

const USER_PREFERENCES_KEY = 'ui:userPreferences';

function getDefaultPreferences(): UserPreferences {
  return {
    defaultPage: '/home',
    defaultScheduleView: 'day',
    showWeekendsByDefault: false,
    itemsPerPage: '20',
    keyboardShortcutsEnabled: true,
    showTooltips: true,
  };
}

function loadStoredPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(USER_PREFERENCES_KEY);
    if (!raw) return getDefaultPreferences();
    return {
      ...getDefaultPreferences(),
      ...(JSON.parse(raw) as Partial<UserPreferences>),
    };
  } catch {
    return getDefaultPreferences();
  }
}

const DEFAULT_PAGE_OPTIONS: Array<{ value: UserPreferences['defaultPage']; label: string }> = [
  { value: '/home', label: 'Home / Dashboard' },
  { value: '/schedule', label: 'Schedule' },
  { value: '/office-flow', label: 'Office Flow' },
  { value: '/tasks', label: 'Tasks' },
  { value: '/patients', label: 'Patients' },
  { value: '/financials', label: 'Financials' },
];

const DEFAULT_PAGE_MODULES: Partial<Record<UserPreferences['defaultPage'], ModuleKey>> = {
  '/home': 'home',
  '/schedule': 'schedule',
  '/office-flow': 'office_flow',
  '/tasks': 'tasks',
  '/patients': 'patients',
  '/financials': 'financials',
};

export function TopBar({ patients = [], onRefresh }: TopBarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>(() => loadStoredPreferences());
  const [preferencesSavedAt, setPreferencesSavedAt] = useState<string | null>(null);
  const [activeEncounter, setActiveEncounterState] = useState(() => getActiveEncounter());
  const defaultPageOptions = DEFAULT_PAGE_OPTIONS.filter((option) => {
    const moduleKey = DEFAULT_PAGE_MODULES[option.value];
    return moduleKey ? canAccessModule(user?.role, moduleKey) : false;
  });

  useEffect(() => {
    const sync = () => setActiveEncounterState(getActiveEncounter());
    const unsubscribe = subscribeToActiveEncounterChanges(sync);
    sync();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!showPreferencesModal) return;
    setPreferences(loadStoredPreferences());
  }, [showPreferencesModal]);

  useEffect(() => {
    if (defaultPageOptions.some((option) => option.value === preferences.defaultPage)) return;
    setPreferences((prev) => ({
      ...prev,
      defaultPage: defaultPageOptions[0]?.value || '/home',
    }));
  }, [defaultPageOptions, preferences.defaultPage]);

  const handlePatientSelect = (patientId: string) => {
    if (patientId) {
      navigate(`/patients/${patientId}`);
      setSearchValue('');
    }
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackText.trim()) return;

    setSubmittingFeedback(true);
    try {
      // Preserve async behavior without timer-driven state updates.
      await Promise.resolve();
      setFeedbackText('');
      setShowFeedbackModal(false);
      alert('Thank you for your feedback!');
    } catch {
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleSavePreferences = () => {
    localStorage.setItem(USER_PREFERENCES_KEY, JSON.stringify(preferences));
    localStorage.setItem('sched:viewMode', preferences.defaultScheduleView);
    localStorage.setItem('sched:showWeekends', String(preferences.showWeekendsByDefault));
    localStorage.setItem('app:defaultLanding', preferences.defaultPage);
    localStorage.setItem('app:itemsPerPage', preferences.itemsPerPage);
    localStorage.setItem('app:keyboardShortcutsEnabled', String(preferences.keyboardShortcutsEnabled));
    localStorage.setItem('app:showTooltips', String(preferences.showTooltips));
    setPreferencesSavedAt(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
    alert('Preferences saved!');
    setShowPreferencesModal(false);
  };

  const handleResetPreferences = () => {
    const defaults = getDefaultPreferences();
    setPreferences(defaults);
    setPreferencesSavedAt(null);
  };

  const updatePreference = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleGoToDefaultPage = () => {
    navigate(preferences.defaultPage);
    setShowPreferencesModal(false);
  };

  const handleGoToLiveEncounter = () => {
    if (!activeEncounter) return;
    navigate(
      `/patients/${activeEncounter.patientId}/encounter/${activeEncounter.encounterId}`,
      {
        state: {
          startedEncounterFrom: activeEncounter.startedEncounterFrom,
          undoAppointmentStatus: activeEncounter.undoAppointmentStatus,
          appointmentTypeName: activeEncounter.appointmentTypeName,
          returnPath: activeEncounter.returnPath,
        },
      }
    );
  };

  const handleClearLiveEncounter = () => {
    clearActiveEncounter();
    setActiveEncounterState(null);
  };

  return (
    <>
      <header className="ema-header" role="banner">
        <div className="ema-header-left">
          <h1 className="ema-brand">
            Mountain Pine<br />Dermatology PLLC
          </h1>
        </div>

        <div className="ema-header-center">
          <div className="ema-patient-search" role="search" aria-label="Patient search">
            <label htmlFor="patient-search" className="sr-only">
              Search for a patient
            </label>
            <select
              id="patient-search"
              className="ema-search-select"
              value={searchValue}
              onChange={(e) => handlePatientSelect(e.target.value)}
              aria-label="Patient search dropdown"
            >
              <option value="">Patient Search...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName} - {p.mrn || 'No MRN'}
                </option>
              ))}
            </select>
            {onRefresh && (
              <button
                type="button"
                className="ema-refresh-btn"
                onClick={onRefresh}
                aria-label="Refresh patient list"
              >
                <span aria-hidden="true">Refresh</span>
              </button>
            )}
          </div>
        </div>

        <div className="ema-header-right">
          {activeEncounter && (
            <div className="ema-live-encounter-banner" role="status" aria-live="polite">
              <button
                type="button"
                className="ema-live-encounter-btn"
                onClick={handleGoToLiveEncounter}
                aria-label="Return to live encounter"
                title={activeEncounter.patientName ? `Live Encounter: ${activeEncounter.patientName}` : 'Live Encounter'}
              >
                Live Encounter
              </button>
              <button
                type="button"
                className="ema-live-encounter-clear"
                onClick={handleClearLiveEncounter}
                aria-label="Clear live encounter shortcut"
                title="Clear shortcut"
              >
                ×
              </button>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <LanguageSwitcher />
            {user && (
              <div className="ema-user-info" role="group" aria-label="User information">
                <span className="ema-user-name" aria-label={`Logged in as ${user.fullName}`}>
                  {user.fullName}
                </span>
                <label htmlFor="role-select" className="sr-only">User role</label>
                <select
                  id="role-select"
                  className="ema-role-select"
                  defaultValue={user.role}
                  aria-label="User role selector"
                >
                  <option value={user.role}>Select {user.role}</option>
                </select>
              </div>
            )}
          </div>
          <nav className="ema-header-links" aria-label="User menu">
            <span className="ema-help-icon" aria-hidden="true"></span>
            <button
              type="button"
              className="ema-link-btn"
              onClick={() => setShowHelpModal(true)}
              aria-label="Open help dialog"
            >
              Help
            </button>
            <span className="ema-separator" aria-hidden="true">•</span>
            <button
              type="button"
              className="ema-link-btn"
              onClick={() => setShowFeedbackModal(true)}
              aria-label="Open feedback dialog"
            >
              Feedback
            </button>
            <span className="ema-separator" aria-hidden="true">•</span>
            <a
              href="/portal/login"
              className="ema-link"
              aria-label="Customer Portal"
            >
              Customer Portal
            </a>
            <span className="ema-separator" aria-hidden="true">•</span>
            <button
              type="button"
              className="ema-link-btn"
              onClick={() => setShowPreferencesModal(true)}
              aria-label="Open preferences dialog"
            >
              Preferences
            </button>
            <span className="ema-separator" aria-hidden="true">•</span>
            <button
              type="button"
              className="ema-link-btn"
              onClick={() => setShowAccountModal(true)}
              aria-haspopup="dialog"
              aria-expanded={showAccountModal}
              aria-label="Open my account menu"
            >
              My Account
            </button>
            <span className="ema-separator" aria-hidden="true">•</span>
            <button
              type="button"
              className="ema-link-btn"
              onClick={logout}
              aria-label="Logout from application"
            >
              Logout
            </button>
          </nav>
        </div>
      </header>

      <HelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        onNavigate={(path) => navigate(path)}
        onOpenFeedback={() => setShowFeedbackModal(true)}
      />

      <Modal isOpen={showFeedbackModal} title="Send Feedback" onClose={() => setShowFeedbackModal(false)}>
        <div className="modal-form">
          <div className="form-field">
            <label htmlFor="feedback-text">Your Feedback</label>
            <textarea
              id="feedback-text"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Tell us about your experience, report a bug, or suggest a feature..."
              rows={6}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem',
                fontFamily: 'inherit'
              }}
              aria-describedby="feedback-help"
              required
            />
          </div>
          <p id="feedback-help" style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.5rem 0 0' }}>
            Your feedback helps us improve the system. Thank you for taking the time to share your thoughts!
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowFeedbackModal(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmitFeedback}
            disabled={!feedbackText.trim() || submittingFeedback}
            aria-busy={submittingFeedback}
          >
            {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </div>
      </Modal>

      <Modal isOpen={showPreferencesModal} title="User Preferences" onClose={() => setShowPreferencesModal(false)}>
        <div className="modal-form">
          <div
            style={{
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '0.875rem',
              marginBottom: '1rem',
            }}
          >
            <div style={{ fontSize: '0.82rem', color: '#4b5563' }}>
              Controls your personal defaults for navigation and schedule behavior.
            </div>
            {preferencesSavedAt ? (
              <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#6b7280' }}>
                Last saved at {preferencesSavedAt}
              </div>
            ) : null}
          </div>

          <div className="form-field">
            <label htmlFor="prefs-default-page">Default Landing Page</label>
            <select
              id="prefs-default-page"
              value={preferences.defaultPage}
              onChange={(e) => updatePreference('defaultPage', e.target.value)}
            >
              {defaultPageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="prefs-default-schedule-view">Default Schedule View</label>
            <select
              id="prefs-default-schedule-view"
              value={preferences.defaultScheduleView}
              onChange={(e) => updatePreference('defaultScheduleView', e.target.value as UserPreferences['defaultScheduleView'])}
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="prefs-items-per-page">Default Items per Page</label>
            <select
              id="prefs-items-per-page"
              value={preferences.itemsPerPage}
              onChange={(e) => updatePreference('itemsPerPage', e.target.value as UserPreferences['itemsPerPage'])}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>

          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                id="prefs-show-weekends"
                type="checkbox"
                checked={preferences.showWeekendsByDefault}
                onChange={(e) => updatePreference('showWeekendsByDefault', e.target.checked)}
              />
              Show weekends by default in schedule
            </label>
          </div>

          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                id="prefs-keyboard-shortcuts"
                type="checkbox"
                checked={preferences.keyboardShortcutsEnabled}
                onChange={(e) => updatePreference('keyboardShortcutsEnabled', e.target.checked)}
              />
              Enable keyboard shortcuts
            </label>
          </div>

          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                id="prefs-show-tooltips"
                type="checkbox"
                checked={preferences.showTooltips}
                onChange={(e) => updatePreference('showTooltips', e.target.checked)}
              />
              Show inline help tooltips
            </label>
          </div>

          <div className="form-field">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleGoToDefaultPage}
              style={{ width: '100%' }}
            >
              Open Default Page Now
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowPreferencesModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-secondary" onClick={handleResetPreferences}>
            Reset
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSavePreferences}
          >
            Save Preferences
          </button>
        </div>
      </Modal>

      <Modal isOpen={showAccountModal} title="My Account" onClose={() => setShowAccountModal(false)}>
        <div className="modal-form">
          {user && (
            <>
              <div style={{
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1.5rem'
              }}>
                <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Name:</span>
                    <span style={{ fontWeight: 500 }}>{user.fullName}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Email:</span>
                    <span style={{ fontWeight: 500 }}>{user.email}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Role:</span>
                    <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{user.role}</span>
                  </div>
                </div>
              </div>
              <div className="form-field">
                <label>Change Password</label>
                <button
                  type="button"
                  onClick={() => alert('Password change functionality coming soon!')}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  Update Password
                </button>
              </div>
              <div className="form-field">
                <label>Two-Factor Authentication</label>
                <button
                  type="button"
                  onClick={() => alert('2FA setup coming soon!')}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  Enable 2FA
                </button>
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-primary" onClick={() => setShowAccountModal(false)}>
            Close
          </button>
        </div>
      </Modal>
    </>
  );
}
