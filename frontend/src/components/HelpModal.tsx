import { Modal } from './ui';
import { API_BASE_URL } from '../utils/apiBase';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (path: string) => void;
  onOpenFeedback?: () => void;
}

const cardStyle: React.CSSProperties = {
  padding: '1rem',
  background: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '0.75rem',
};

const itemTitleStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: 600,
  color: '#0f172a',
  marginBottom: '0.4rem',
};

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: '1.25rem',
  color: '#4b5563',
  fontSize: '0.86rem',
  lineHeight: 1.55,
};

const issueItemStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  background: '#ffffff',
  padding: '0.75rem',
};

export function HelpModal({ isOpen, onClose, onNavigate, onOpenFeedback }: HelpModalProps) {
  return (
    <Modal isOpen={isOpen} title="Help & Support" onClose={onClose} size="lg">
      <div style={{ padding: '1rem 0', display: 'grid', gap: '1.25rem' }}>
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Start of Day Checklist</h3>
          <ol style={listStyle}>
            <li>Confirm your role in the top bar role selector is correct for today&apos;s tasks.</li>
            <li>Open Schedule and verify location/provider filters before patient arrivals.</li>
            <li>Open Office Flow and confirm rooms are assigned and visible.</li>
            <li>Check Home metrics for pending tasks, open encounters, and unchecked-in appointments.</li>
          </ol>
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Front Desk Workflow</h3>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div>
              <div style={itemTitleStyle}>Check-In</div>
              <ol style={listStyle}>
                <li>Select appointment in Schedule and click <strong>Check In</strong>.</li>
                <li>Confirm copay/past-balance prompt and choose collect or bypass with reason.</li>
                <li>Verify patient moves to Waiting Room on Office Flow.</li>
              </ol>
            </div>
            <div>
              <div style={itemTitleStyle}>No-Show and Late Arrival</div>
              <ol style={listStyle}>
                <li>Mark no-show only after staff confirmation.</li>
                <li>If patient arrives late, use <strong>Undo No-Show</strong> before check-in.</li>
                <li>If fee policy applies, verify fee posts to patient ledger and financial reports.</li>
              </ol>
            </div>
            <div>
              <div style={itemTitleStyle}>Checkout</div>
              <ol style={listStyle}>
                <li>When provider ends visit, move patient to checkout stage in Office Flow.</li>
                <li>Collect balance and confirm payment event appears in Financials.</li>
                <li>Schedule follow-up if required before final completion.</li>
              </ol>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Clinical Workflow</h3>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div>
              <div style={itemTitleStyle}>Encounter</div>
              <ol style={listStyle}>
                <li>Start encounter from Schedule or Office Flow.</li>
                <li>Document vitals, findings, diagnoses, and performed work before ending visit.</li>
                <li>If follow-up is needed, set reschedule instructions before closeout.</li>
              </ol>
            </div>
            <div>
              <div style={itemTitleStyle}>Orders / Rx / Prior Auth</div>
              <ol style={listStyle}>
                <li>Create orders from encounter for labs/pathology when clinically indicated.</li>
                <li>Use Rx for medications and track authorization requirements in ePA.</li>
                <li>Confirm front desk sees prior-auth status at check-in when needed.</li>
              </ol>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Documents and Photos</h3>
          <ol style={listStyle}>
            <li>Upload photos/documents in patient chart or Photos/Documents pages.</li>
            <li>Use standardized templates for handouts and aftercare to keep printouts consistent.</li>
            <li>For tablet capture, verify image preview appears before saving to chart.</li>
          </ol>
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Troubleshooting</h3>
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            <div style={issueItemStyle}>
              <div style={itemTitleStyle}>Login Failed</div>
              <div style={{ fontSize: '0.83rem', color: '#4b5563' }}>
                Verify tenant is <strong>tenant-demo</strong>, then confirm backend API is running on port 4000.
              </div>
            </div>
            <div style={issueItemStyle}>
              <div style={itemTitleStyle}>Failed to Fetch / API Errors</div>
              <div style={{ fontSize: '0.83rem', color: '#4b5563' }}>
                Check API health, then refresh once backend is available. Most red X console errors are backend-down conditions.
              </div>
            </div>
            <div style={issueItemStyle}>
              <div style={itemTitleStyle}>Patient Missing in Office Flow</div>
              <div style={{ fontSize: '0.83rem', color: '#4b5563' }}>
                Confirm status transition completed (checked-in/in-room/with-provider) and reload Office Flow if state was stale.
              </div>
            </div>
            <div style={issueItemStyle}>
              <div style={itemTitleStyle}>Data Mismatch Between Home and Schedule</div>
              <div style={{ fontSize: '0.83rem', color: '#4b5563' }}>
                Ensure both pages are using the same date, location, and provider filters before comparing counts.
              </div>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Role Access Guide</h3>
          <ul style={listStyle}>
            <li><strong>Front Desk:</strong> schedule, check-in, office flow, payments, messaging.</li>
            <li><strong>Clinical Team:</strong> encounters, notes, diagnoses, orders, photos, labs.</li>
            <li><strong>Billing/Finance:</strong> claims, payment posting, fee schedules, A/R dashboards.</li>
            <li><strong>Admin:</strong> users, providers, facilities, integrations, audit logs.</li>
          </ul>
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Role Training</h3>
          <p style={{ margin: 0, marginBottom: '0.7rem', fontSize: '0.85rem', color: '#4b5563' }}>
            New staff should complete the role-based training walkthrough before working live patients.
          </p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (onNavigate) {
                onNavigate('/training');
              }
              onClose();
            }}
          >
            Open Training Center
          </button>
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Escalation Steps</h3>
          <ol style={listStyle}>
            <li>Capture page name, patient ID (if applicable), and exact local time.</li>
            <li>Capture action taken and visible error text.</li>
            <li>Submit issue using Feedback so engineering has reproducible details.</li>
          </ol>
          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.85rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (onOpenFeedback) {
                  onOpenFeedback();
                }
                onClose();
              }}
            >
              Open Feedback Form
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (onNavigate) {
                  onNavigate('/admin/audit-log?preset=recent');
                }
                onClose();
              }}
            >
              Open Audit Log
            </button>
          </div>
        </div>

        <div style={{
          border: '1px solid #dbeafe',
          borderRadius: '8px',
          background: '#eff6ff',
          padding: '0.85rem',
          fontSize: '0.8rem',
          color: '#1e3a8a',
        }}>
          Environment: <strong>{API_BASE_URL.includes('localhost') ? 'Development' : 'Production'}</strong>
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
