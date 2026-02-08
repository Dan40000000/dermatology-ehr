import { Modal } from './ui';
import { API_BASE_URL } from '../utils/apiBase';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  return (
    <Modal isOpen={isOpen} title="Help & Support" onClose={onClose} size="lg">
      <div style={{ padding: '1rem 0' }}>
        {/* Quick Help Section */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '1rem' }}>
            Quick Help
          </h3>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{
              padding: '1rem',
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px'
            }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0369a1', marginBottom: '0.5rem' }}>
                Keyboard Shortcuts
              </h4>
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                  <span>Show all shortcuts</span>
                  <kbd style={{
                    background: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    padding: '0.125rem 0.5rem',
                    fontSize: '0.75rem'
                  }}>Shift + ?</kbd>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                  <span>Search patients</span>
                  <kbd style={{
                    background: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    padding: '0.125rem 0.5rem',
                    fontSize: '0.75rem'
                  }}>Ctrl/Cmd + K</kbd>
                </div>
              </div>
            </div>

            <div style={{
              padding: '1rem',
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px'
            }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0369a1', marginBottom: '0.5rem' }}>
                Common Tasks
              </h4>
              <ul style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0, paddingLeft: '1.5rem' }}>
                <li>Create new patient: Navigate to Patients → Register New Patient</li>
                <li>Schedule appointment: Navigate to Schedule → New Appointment</li>
                <li>Document encounter: Select patient → Start New Encounter</li>
                <li>Create task: Navigate to Tasks → New Task (or press N)</li>
              </ul>
            </div>

            <div style={{
              padding: '1rem',
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px'
            }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0369a1', marginBottom: '0.5rem' }}>
                Export Data
              </h4>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
                Most pages include export buttons in the top right. You can export data as CSV or PDF,
                or use the Print function for formatted printouts.
              </p>
            </div>
          </div>
        </div>

        {/* Support Resources */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '1rem' }}>
            Support Resources
          </h3>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <a
              href="https://docs.example.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '0.75rem 1rem',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                color: '#0369a1',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                fontSize: '0.875rem',
                fontWeight: 500
              }}
            >
              <span></span>
              <span>Documentation & User Guides</span>
            </a>
            <a
              href="https://support.example.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '0.75rem 1rem',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                color: '#0369a1',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                fontSize: '0.875rem',
                fontWeight: 500
              }}
            >
              <span></span>
              <span>Contact Support</span>
            </a>
            <a
              href="https://training.example.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '0.75rem 1rem',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                color: '#0369a1',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                fontSize: '0.875rem',
                fontWeight: 500
              }}
            >
              <span></span>
              <span>Training Videos</span>
            </a>
          </div>
        </div>

        {/* System Information */}
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '1rem' }}>
            System Information
          </h3>
          <div style={{
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
            fontSize: '0.875rem',
            color: '#6b7280'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
              <span>Version:</span>
              <span style={{ fontWeight: 500, color: '#374151' }}>1.0.0</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
              <span>Environment:</span>
              <span style={{ fontWeight: 500, color: '#374151' }}>
                {API_BASE_URL.includes('localhost') ? 'Development' : 'Production'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
              <span>Browser:</span>
              <span style={{ fontWeight: 500, color: '#374151' }}>{navigator.userAgent.split(' ').pop()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="modal-footer">
        <button type="button" className="btn-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
