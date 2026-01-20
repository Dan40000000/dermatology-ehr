import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { HelpModal } from '../HelpModal';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { Modal } from '../ui';
import type { Patient } from '../../types';

interface TopBarProps {
  patients?: Patient[];
  onRefresh?: () => void;
}

export function TopBar({ patients = [], onRefresh }: TopBarProps) {
  const { t } = useTranslation('common');
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

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
      // Simulate API call - in production, this would send to a feedback endpoint
      await new Promise(resolve => setTimeout(resolve, 1000));
      setFeedbackText('');
      setShowFeedbackModal(false);
      alert('Thank you for your feedback!');
    } catch (error) {
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setSubmittingFeedback(false);
    }
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
              href="https://portal.example.com"
              target="_blank"
              rel="noopener noreferrer"
              className="ema-link"
              aria-label="Customer Portal (opens in new window)"
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

      {/* Help Modal */}
      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />

      {/* Feedback Modal */}
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

      {/* Preferences Modal */}
      <Modal isOpen={showPreferencesModal} title="User Preferences" onClose={() => setShowPreferencesModal(false)}>
        <div className="modal-form">
          <div className="form-field">
            <label>Theme</label>
            <select defaultValue="light">
              <option value="light">Light</option>
              <option value="dark">Dark (Coming Soon)</option>
            </select>
          </div>
          <div className="form-field">
            <label>Default Page</label>
            <select defaultValue="/home">
              <option value="/home">Home / Dashboard</option>
              <option value="/schedule">Schedule</option>
              <option value="/patients">Patients</option>
              <option value="/tasks">Tasks</option>
            </select>
          </div>
          <div className="form-field">
            <label>Items per Page</label>
            <select defaultValue="20">
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" defaultChecked />
              Enable keyboard shortcuts
            </label>
          </div>
          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" defaultChecked />
              Show tooltips
            </label>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowPreferencesModal(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              alert('Preferences saved!');
              setShowPreferencesModal(false);
            }}
          >
            Save Preferences
          </button>
        </div>
      </Modal>

      {/* My Account Modal */}
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
