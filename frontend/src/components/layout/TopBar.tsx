import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAccessControl } from '../../contexts/AccessControlContext';
import { type ModuleKey } from '../../config/moduleAccess';
import { getEffectiveRoles } from '../../utils/roles';
import { HelpModal } from '../HelpModal';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { Modal } from '../ui';
import { PatientLookupSelect } from '../patients/PatientLookupSelect';
import { FeedbackScreenshotEditor } from '../feedback/FeedbackScreenshotEditor';
import type { Patient } from '../../types';
import { API_BASE_URL } from '../../utils/apiBase';
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

type FeedbackType = 'issue' | 'suggestion';
type FeedbackSeverity = 'blocker' | 'annoying' | 'suggestion' | 'question';

const USER_PREFERENCES_KEY = 'ui:userPreferences';
const AI_ASSISTANT_URL =
  import.meta.env.VITE_AI_ASSISTANT_URL ||
  import.meta.env.VITE_CLINICAL_COPILOT_URL ||
  '/ai-assistant';

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

async function capturePageScreenshot(): Promise<File | null> {
  const html2canvasModule = await import('html2canvas');
  const html2canvas = html2canvasModule.default;
  const target = document.querySelector('#main-content') || document.body;
  const canvas = await html2canvas(target as HTMLElement, {
    backgroundColor: '#ffffff',
    logging: false,
    scale: Math.min(window.devicePixelRatio || 1, 1.5),
    useCORS: true,
  });

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      resolve(new File([blob], `page-capture-${timestamp}.png`, { type: 'image/png' }));
    }, 'image/png');
  });
}

export function TopBar({ patients = [], onRefresh }: TopBarProps) {
  const { user, session, logout } = useAuth();
  const accessControl = useAccessControl();
  const navigate = useNavigate();
  const effectiveRoles = getEffectiveRoles(user || session?.user);
  const showAiAssistantLink = accessControl.canAccessModule('ai_assistant', effectiveRoles);
  const [searchValue, setSearchValue] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showFeedbackMarkupModal, setShowFeedbackMarkupModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('issue');
  const [feedbackSeverity, setFeedbackSeverity] = useState<FeedbackSeverity>('annoying');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackFiles, setFeedbackFiles] = useState<File[]>([]);
  const [feedbackRawPageCapture, setFeedbackRawPageCapture] = useState<File | null>(null);
  const [feedbackPageCapture, setFeedbackPageCapture] = useState<File | null>(null);
  const [feedbackPageCapturePreviewUrl, setFeedbackPageCapturePreviewUrl] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [capturingFeedbackPage, setCapturingFeedbackPage] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [resumeFeedbackFormAfterMarkup, setResumeFeedbackFormAfterMarkup] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>(() => loadStoredPreferences());
  const [preferencesSavedAt, setPreferencesSavedAt] = useState<string | null>(null);
  const [activeEncounter, setActiveEncounterState] = useState(() => getActiveEncounter());
  const defaultPageOptions = DEFAULT_PAGE_OPTIONS.filter((option) => {
    const moduleKey = DEFAULT_PAGE_MODULES[option.value];
    return moduleKey ? accessControl.canAccessModule(moduleKey, effectiveRoles) : false;
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

  useEffect(() => {
    if (!feedbackPageCapture) {
      setFeedbackPageCapturePreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(feedbackPageCapture);
    setFeedbackPageCapturePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [feedbackPageCapture]);

  const handlePatientSelect = (patientId: string) => {
    if (patientId) {
      navigate(`/patients/${patientId}`);
      setSearchValue('');
    }
  };

  const resetFeedbackDraft = (type: FeedbackType) => {
    setFeedbackType(type);
    setFeedbackSeverity(type === 'issue' ? 'annoying' : 'suggestion');
    setFeedbackText('');
    setFeedbackFiles([]);
    setFeedbackRawPageCapture(null);
    setFeedbackPageCapture(null);
    setFeedbackStatus(null);
    setResumeFeedbackFormAfterMarkup(false);
  };

  const handleFeedbackCaptureFailure = () => {
    setFeedbackStatus('Page screenshot unavailable. Add a photo if helpful.');
    setShowFeedbackMarkupModal(false);
    setShowFeedbackModal(true);
  };

  const handleOpenFeedback = async (type: FeedbackType = 'issue') => {
    resetFeedbackDraft(type);
    setShowFeedbackModal(false);
    setShowFeedbackMarkupModal(false);
    setCapturingFeedbackPage(true);
    try {
      const capture = await capturePageScreenshot();
      if (!capture) {
        handleFeedbackCaptureFailure();
        return;
      }

      setFeedbackRawPageCapture(capture);
      setFeedbackPageCapture(capture);
      setShowFeedbackMarkupModal(true);
    } catch {
      handleFeedbackCaptureFailure();
    } finally {
      setCapturingFeedbackPage(false);
    }
  };

  const handleRefreshPageCapture = async () => {
    setCapturingFeedbackPage(true);
    setFeedbackStatus(null);
    setResumeFeedbackFormAfterMarkup(true);
    setShowFeedbackModal(false);
    try {
      const capture = await capturePageScreenshot();
      if (!capture) {
        handleFeedbackCaptureFailure();
        return;
      }

      setFeedbackRawPageCapture(capture);
      setFeedbackPageCapture(capture);
      setShowFeedbackMarkupModal(true);
    } catch {
      handleFeedbackCaptureFailure();
    } finally {
      setCapturingFeedbackPage(false);
    }
  };

  const handleOpenFeedbackMarkup = () => {
    if (!feedbackRawPageCapture) return;
    setFeedbackStatus(null);
    setResumeFeedbackFormAfterMarkup(true);
    setShowFeedbackModal(false);
    setShowFeedbackMarkupModal(true);
  };

  const handleCancelFeedbackMarkup = () => {
    setShowFeedbackMarkupModal(false);
    if (resumeFeedbackFormAfterMarkup) {
      setShowFeedbackModal(true);
    }
    setResumeFeedbackFormAfterMarkup(false);
  };

  const handleUseOriginalFeedbackCapture = () => {
    if (!feedbackRawPageCapture) {
      handleFeedbackCaptureFailure();
      return;
    }

    setFeedbackPageCapture(feedbackRawPageCapture);
    setFeedbackStatus('Attached current page screenshot.');
    setShowFeedbackMarkupModal(false);
    setShowFeedbackModal(true);
    setResumeFeedbackFormAfterMarkup(false);
  };

  const handleConfirmFeedbackMarkup = (annotatedCapture: File) => {
    setFeedbackPageCapture(annotatedCapture);
    setFeedbackStatus('Attached marked-up page screenshot.');
    setShowFeedbackMarkupModal(false);
    setShowFeedbackModal(true);
    setResumeFeedbackFormAfterMarkup(false);
  };

  const handleFeedbackFilesChange = (files: FileList | null) => {
    setFeedbackFiles(files ? Array.from(files).slice(0, 6) : []);
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackText.trim() || !session) return;

    setSubmittingFeedback(true);
    setFeedbackStatus(null);
    try {
      const form = new FormData();
      form.append('type', feedbackType);
      form.append('severity', feedbackSeverity);
      form.append('message', feedbackText.trim());
      form.append('pageUrl', window.location.href);
      form.append('pathname', window.location.pathname + window.location.search);
      form.append('userAgent', navigator.userAgent);
      form.append('viewport', `${window.innerWidth}x${window.innerHeight}`);
      form.append('capturedAt', new Date().toISOString());

      if (feedbackPageCapture) {
        form.append('attachments', feedbackPageCapture);
      }

      feedbackFiles.forEach((file) => {
        form.append('attachments', file);
      });

      const response = await fetch(`${API_BASE_URL}/api/professional-feedback`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
        body: form,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to submit feedback');
      }

      setFeedbackText('');
      setFeedbackFiles([]);
      setFeedbackRawPageCapture(null);
      setFeedbackPageCapture(null);
      setResumeFeedbackFormAfterMarkup(false);
      setShowFeedbackModal(false);
      alert('Issue/suggestion sent to Dan.');
    } catch (error) {
      setFeedbackStatus(error instanceof Error ? error.message : 'Failed to submit feedback. Please try again.');
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
            Dermatology DEMO<br />Office
          </h1>
        </div>

        <div className="ema-header-center">
          <div className="ema-patient-search" role="search" aria-label="Patient search">
            <PatientLookupSelect
              id="patient-search"
              patients={patients}
              value={searchValue}
              onChange={handlePatientSelect}
              label="Search for a patient"
              labelClassName="sr-only"
              placeholder="Patient Search..."
              selectClassName="ema-search-select"
              compact
              hideSelect
              maxResults={6}
              showInitialResults={false}
            />
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
              onClick={() => {
                void handleOpenFeedback('issue');
              }}
              aria-label="Report issue or suggestion"
              disabled={capturingFeedbackPage}
            >
              {capturingFeedbackPage ? 'Capturing...' : 'Issue / Suggestion'}
            </button>
            <span className="ema-separator" aria-hidden="true">•</span>
            <a
              href="/portal/login"
              className="ema-link"
              aria-label="Customer Portal"
            >
              Customer Portal
            </a>
            {showAiAssistantLink && (
              <>
                <span className="ema-separator" aria-hidden="true">•</span>
                <a
                  href={AI_ASSISTANT_URL}
                  className="ema-link"
                  aria-label="Open AI assistant in a new window"
                  target="_blank"
                  rel="noreferrer"
                  title="Opens the standalone AI assistant in a new window"
                >
                  AI Assistant
                </a>
              </>
            )}
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
        onOpenFeedback={() => {
          void handleOpenFeedback('suggestion');
        }}
      />

      <Modal isOpen={showFeedbackMarkupModal} title="Mark Up Screenshot" onClose={handleCancelFeedbackMarkup}>
        {feedbackRawPageCapture ? (
          <FeedbackScreenshotEditor
            imageFile={feedbackRawPageCapture}
            onConfirm={handleConfirmFeedbackMarkup}
            onUseOriginal={handleUseOriginalFeedbackCapture}
            onCancel={handleCancelFeedbackMarkup}
          />
        ) : (
          <div style={{ fontSize: '0.9rem', color: '#4b5563' }}>
            Screenshot unavailable. Continue without markup.
          </div>
        )}
      </Modal>

      <Modal isOpen={showFeedbackModal} title="Report Issue / Suggestion" onClose={() => setShowFeedbackModal(false)}>
        <div className="modal-form">
          <div
            style={{
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              borderRadius: '8px',
              padding: '0.75rem',
              color: '#7c2d12',
              fontSize: '0.8rem',
              lineHeight: 1.4,
            }}
          >
            This sends the current page, your note, and any attached photos to Dan for professional testing review.
            Use synthetic/demo patient data only.
          </div>

          <div className="form-field">
            <label htmlFor="feedback-type">Type</label>
            <select
              id="feedback-type"
              value={feedbackType}
              onChange={(e) => setFeedbackType(e.target.value as FeedbackType)}
            >
              <option value="issue">Issue</option>
              <option value="suggestion">Suggestion</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="feedback-severity">Severity</label>
            <select
              id="feedback-severity"
              value={feedbackSeverity}
              onChange={(e) => setFeedbackSeverity(e.target.value as FeedbackSeverity)}
            >
              <option value="blocker">Blocker</option>
              <option value="annoying">Annoying / Workflow Friction</option>
              <option value="suggestion">Suggestion</option>
              <option value="question">Question</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="feedback-text">What happened or what should improve?</label>
            <textarea
              id="feedback-text"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Example: I clicked Add Procedure from Sarah Johnson's visit, expected Botox to appear, but it did not show up."
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

          <div className="form-field">
            <label>Current page screenshot</label>
            <div
              style={{
                display: 'grid',
                gap: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                padding: '0.75rem',
                background: '#f9fafb',
              }}
            >
              {feedbackPageCapturePreviewUrl ? (
                <img
                  src={feedbackPageCapturePreviewUrl}
                  alt="Current page screenshot preview"
                  style={{
                    width: '100%',
                    maxHeight: '14rem',
                    objectFit: 'contain',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    background: '#ffffff',
                  }}
                />
              ) : null}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.82rem', color: feedbackPageCapture ? '#166534' : '#6b7280' }}>
                  {feedbackPageCapture ? feedbackPageCapture.name : 'No page screenshot attached'}
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleOpenFeedbackMarkup}
                    disabled={!feedbackRawPageCapture || capturingFeedbackPage}
                  >
                    Mark Up Screenshot
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      void handleRefreshPageCapture();
                    }}
                    disabled={capturingFeedbackPage}
                  >
                    {capturingFeedbackPage ? 'Capturing...' : 'Re-capture'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="feedback-photos">Attach photos/screenshots</label>
            <input
              id="feedback-photos"
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={(e) => handleFeedbackFilesChange(e.target.files)}
            />
            {feedbackFiles.length > 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#374151' }}>
                {feedbackFiles.length} photo{feedbackFiles.length === 1 ? '' : 's'} attached
              </div>
            )}
          </div>

          {feedbackStatus && (
            <div
              role="status"
              style={{
                border: '1px solid #dbeafe',
                borderRadius: '8px',
                background: '#eff6ff',
                color: '#1e3a8a',
                padding: '0.65rem 0.75rem',
                fontSize: '0.8rem',
              }}
            >
              {feedbackStatus}
            </div>
          )}

          <p id="feedback-help" style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.5rem 0 0' }}>
            Page URL, role, browser, and viewport are included automatically.
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
            disabled={!feedbackText.trim() || submittingFeedback || !session}
            aria-busy={submittingFeedback}
          >
            {submittingFeedback ? 'Sending...' : 'Send to Dan'}
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
