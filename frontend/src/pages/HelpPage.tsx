import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

type TrainingRole = 'front_desk' | 'provider' | 'ma' | 'billing' | 'admin';
type SnapshotVariant = 'schedule' | 'office-flow' | 'encounter' | 'claims' | 'admin';

interface TrainingStep {
  id: string;
  title: string;
  objective: string;
  checklist: string[];
  commonPitfalls: string[];
  openPath: string;
  openLabel: string;
  snapshot: SnapshotVariant;
}

interface RoleTrainingGuide {
  label: string;
  intro: string;
  firstDayChecklist: string[];
  steps: TrainingStep[];
}

const roleGuides: Record<TrainingRole, RoleTrainingGuide> = {
  front_desk: {
    label: 'Front Desk',
    intro: 'Focus on check-in, flow management, and checkout without missing required confirmations.',
    firstDayChecklist: [
      'Confirm location/provider filters in Schedule before opening the day.',
      'Verify waiting room and room board are populated in Office Flow.',
      'Confirm no-show and copay policy prompts are enabled before first check-in.',
    ],
    steps: [
      {
        id: 'fd-checkin',
        title: 'Run Check-In Correctly',
        objective: 'Move the patient from schedule to waiting room with payment and prior-auth checks captured.',
        checklist: [
          'Select appointment in Schedule and use the inline mini-actions.',
          'Click Check In and resolve copay/past-balance prompt.',
          'Confirm patient appears in Office Flow waiting room immediately.',
        ],
        commonPitfalls: [
          'Checking in with wrong location/provider filter active.',
          'Skipping copay decision and leaving the visit in ambiguous state.',
        ],
        openPath: '/schedule',
        openLabel: 'Open Schedule',
        snapshot: 'schedule',
      },
      {
        id: 'fd-flow',
        title: 'Manage Room Flow and Late Arrivals',
        objective: 'Keep patient movement accurate and reversible when mistakes happen.',
        checklist: [
          'Move waiting patients to room only when room assignment is confirmed.',
          'If a patient was marked no-show by mistake, use Undo No-Show before continuing.',
          'Verify in-room counts remain visible after visit transitions.',
        ],
        commonPitfalls: [
          'Leaving patient status stale after late arrival reversal.',
          'Forgetting to refresh flow board after network interruption.',
        ],
        openPath: '/office-flow',
        openLabel: 'Open Office Flow',
        snapshot: 'office-flow',
      },
      {
        id: 'fd-checkout',
        title: 'Close Visit at Checkout',
        objective: 'Collect payment, schedule follow-up, and complete visit without losing revenue.',
        checklist: [
          'Confirm provider finished encounter and patient moved to checkout stage.',
          'Collect outstanding balance and verify payment posts to Financials.',
          'If follow-up is required, schedule it before marking completed.',
        ],
        commonPitfalls: [
          'Completing visit before required follow-up scheduling.',
          'Payment collected but not confirmed in financial view.',
        ],
        openPath: '/financials',
        openLabel: 'Open Financials',
        snapshot: 'claims',
      },
    ],
  },
  provider: {
    label: 'Provider',
    intro: 'Use encounter workflows to document care, complete performed work, and hand off cleanly to checkout.',
    firstDayChecklist: [
      'Review today’s schedule by location/provider before clinic starts.',
      'Confirm body map and photos load in patient chart for visual documentation.',
      'Verify your default note and order workflows on one test patient.',
    ],
    steps: [
      {
        id: 'pr-encounter',
        title: 'Run Encounter End-to-End',
        objective: 'Document history, exam, plan, and complete visit with no missing critical fields.',
        checklist: [
          'Start encounter from Schedule or Office Flow.',
          'Complete clinical sections and performed work before ending visit.',
          'Set follow-up instructions/reschedule needs before finalizing.',
        ],
        commonPitfalls: [
          'Ending visit before performed work is captured.',
          'Not passing reschedule requirements back to front desk.',
        ],
        openPath: '/patients',
        openLabel: 'Open Patients',
        snapshot: 'encounter',
      },
      {
        id: 'pr-orders',
        title: 'Place Orders and Rx Cleanly',
        objective: 'Place clinical orders and prescriptions that downstream teams can act on immediately.',
        checklist: [
          'Use Orders for labs/path/biopsy requests tied to encounter context.',
          'Use Rx for medication plan and capture refill/authorization needs.',
          'Confirm any prior-auth requirement is visible before checkout.',
        ],
        commonPitfalls: [
          'Using wrong workflow (order vs prescription).',
          'Missing diagnosis linkage for insurance-routed items.',
        ],
        openPath: '/orders',
        openLabel: 'Open Orders',
        snapshot: 'encounter',
      },
      {
        id: 'pr-close',
        title: 'Hand Off to Checkout',
        objective: 'Transition patient back to office flow with clear next actions.',
        checklist: [
          'End encounter only after charting and charges are complete.',
          'Ensure office flow status updates to checkout/completed path.',
          'Confirm handouts/docs are generated when needed.',
        ],
        commonPitfalls: [
          'Flow state not refreshed after ending encounter.',
          'Missing checkout instructions causing front-desk delay.',
        ],
        openPath: '/office-flow',
        openLabel: 'Open Office Flow',
        snapshot: 'office-flow',
      },
    ],
  },
  ma: {
    label: 'MA / Nurse',
    intro: 'Prepare roomed patients fast, keep intake data accurate, and keep provider handoff friction low.',
    firstDayChecklist: [
      'Validate room assignment map for your shift location.',
      'Verify vitals capture and chart update path in encounter.',
      'Check photo/body map loading in patient chart.',
    ],
    steps: [
      {
        id: 'ma-room',
        title: 'Room Patients Consistently',
        objective: 'Move patient from waiting to exam room with clean intake status.',
        checklist: [
          'Select patient from Office Flow waiting queue.',
          'Assign room and verify in-room board reflects assignment.',
          'Prepare intake/vitals for provider handoff.',
        ],
        commonPitfalls: [
          'Wrong room assignment with no correction step.',
          'Missing update leaves patient in waiting while physically roomed.',
        ],
        openPath: '/office-flow',
        openLabel: 'Open Office Flow',
        snapshot: 'office-flow',
      },
      {
        id: 'ma-intake',
        title: 'Capture Vitals and Clinical Prep',
        objective: 'Ensure intake data is complete and visible in encounter history.',
        checklist: [
          'Enter vitals and verify they persist in patient profile trends.',
          'Attach relevant photos/body map annotations if required.',
          'Flag provider when chart is ready.',
        ],
        commonPitfalls: [
          'Vitals entered but not submitted/saved.',
          'Photos uploaded with wrong type/label.',
        ],
        openPath: '/patients',
        openLabel: 'Open Patients',
        snapshot: 'encounter',
      },
      {
        id: 'ma-handoff',
        title: 'Support Post-Visit Tasks',
        objective: 'Help close loose ends before patient checkout.',
        checklist: [
          'Confirm tasks/handouts generated for patient where needed.',
          'Ensure follow-up instructions are communicated to front desk.',
          'Verify room status is released for next patient.',
        ],
        commonPitfalls: [
          'Room remains occupied in system after patient leaves.',
          'Follow-up tasks left undocumented.',
        ],
        openPath: '/tasks',
        openLabel: 'Open Tasks',
        snapshot: 'schedule',
      },
    ],
  },
  billing: {
    label: 'Billing / Finance',
    intro: 'Track charges, payment posting, and claim follow-up with accurate queue prioritization.',
    firstDayChecklist: [
      'Review claims queues for denied/rejected/high-balance accounts.',
      'Verify payment posting feed and today revenue metrics are updating.',
      'Confirm fee schedule values for key CPT services.',
    ],
    steps: [
      {
        id: 'bi-claims',
        title: 'Work Claims Queue',
        objective: 'Triaging claims by status and aging while reducing denial backlog.',
        checklist: [
          'Open claims queue and prioritize denied/rejected/appealed items.',
          'Review payer and follow-up priority panels for high-impact work.',
          'Document next action for each delayed claim.',
        ],
        commonPitfalls: [
          'Only sorting by date and missing high-dollar aged claims.',
          'Not documenting follow-up owner/date.',
        ],
        openPath: '/claims',
        openLabel: 'Open Claims',
        snapshot: 'claims',
      },
      {
        id: 'bi-post',
        title: 'Post Payments and Reconcile',
        objective: 'Ensure collected payments and earned revenue are visible and reconcilable.',
        checklist: [
          'Post payments and verify ledger/account updates.',
          'Confirm daily payment total equals front-desk collection total.',
          'Review aging buckets for patient vs insurance balance movement.',
        ],
        commonPitfalls: [
          'Payment posted without linking to claim/invoice context.',
          'Aging trend not reviewed after large posting batches.',
        ],
        openPath: '/financials',
        openLabel: 'Open Financials',
        snapshot: 'claims',
      },
      {
        id: 'bi-fee',
        title: 'Maintain Fee Schedules',
        objective: 'Keep CPT descriptions and dollar values consistent and audit-ready.',
        checklist: [
          'Validate CPT code, description, and dollar fee for updated rows.',
          'Export snapshot before major fee update.',
          'Coordinate with admin before activating new schedule.',
        ],
        commonPitfalls: [
          'Blank/invalid fee values causing downstream NaN display.',
          'Uncontrolled edits without change review.',
        ],
        openPath: '/admin/fee-schedules',
        openLabel: 'Open Fee Schedules',
        snapshot: 'admin',
      },
    ],
  },
  admin: {
    label: 'Administrator',
    intro: 'Configure people, locations, security, and audit controls while preserving role-based access boundaries.',
    firstDayChecklist: [
      'Verify facilities/rooms/providers match real clinic structure.',
      'Confirm role permissions for front desk, clinical, and billing groups.',
      'Review audit logs for failed login or access anomalies.',
    ],
    steps: [
      {
        id: 'ad-setup',
        title: 'Set Up Operational Structure',
        objective: 'Keep facilities, rooms, providers, and users aligned to real operations.',
        checklist: [
          'Review Admin tabs: Facilities, Rooms, Providers, Users.',
          'Validate inventory facilities and schedule locations match source of truth.',
          'Deactivate outdated users/rooms safely.',
        ],
        commonPitfalls: [
          'Mismatch between room/location setup and schedule filters.',
          'Adding users with incorrect default role.',
        ],
        openPath: '/admin?tab=facilities',
        openLabel: 'Open Admin',
        snapshot: 'admin',
      },
      {
        id: 'ad-security',
        title: 'Monitor Security and Access',
        objective: 'Ensure HIPAA minimum-necessary role access stays enforced.',
        checklist: [
          'Open Audit Log preset views for recent and failed logins.',
          'Validate front desk cannot access restricted clinical endpoints.',
          'Review account role changes weekly.',
        ],
        commonPitfalls: [
          'Skipping review of failed login spikes.',
          'Expanding role access without documented justification.',
        ],
        openPath: '/admin/audit-log?preset=failed-logins',
        openLabel: 'Open Audit Log',
        snapshot: 'admin',
      },
      {
        id: 'ad-integrations',
        title: 'Manage Integrations and Readiness',
        objective: 'Track external dependencies and keep launch controls green.',
        checklist: [
          'Review integration status for SMS, fax, payments, and clearinghouse.',
          'Run readiness checks after credential or config changes.',
          'Log changes in handoff guide before ending admin session.',
        ],
        commonPitfalls: [
          'Changing integration env without verification run.',
          'No rollback note after high-risk config updates.',
        ],
        openPath: '/admin/integrations',
        openLabel: 'Open Integrations',
        snapshot: 'admin',
      },
    ],
  },
};

function normalizeRole(role?: string): TrainingRole {
  switch (role) {
    case 'front_desk':
    case 'scheduler':
      return 'front_desk';
    case 'provider':
      return 'provider';
    case 'ma':
    case 'nurse':
      return 'ma';
    case 'billing':
      return 'billing';
    default:
      return 'admin';
  }
}

const snapshotSources: Record<SnapshotVariant, { src: string; title: string }> = {
  schedule: { src: '/training/schedule.png', title: 'Schedule Snapshot' },
  'office-flow': { src: '/training/office-flow.png', title: 'Office Flow Snapshot' },
  encounter: { src: '/training/encounter.png', title: 'Encounter Snapshot' },
  claims: { src: '/training/claims.png', title: 'Claims Snapshot' },
  admin: { src: '/training/admin.png', title: 'Admin Snapshot' },
};

function SnapshotFallback({ title }: { title: string }) {
  return (
    <div style={{ border: '1px solid #d1d5db', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
      <div style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb', padding: '0.45rem 0.7rem' }}>
        <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#334155' }}>{title}</div>
      </div>
      <div style={{ padding: '0.8rem', color: '#64748b', fontSize: '0.82rem' }}>
        Screenshot unavailable. Re-capture training snapshots to restore this preview.
      </div>
    </div>
  );
}

function SnapshotImage({ variant }: { variant: SnapshotVariant }) {
  const [loadFailed, setLoadFailed] = useState(false);
  const source = snapshotSources[variant];

  if (loadFailed) {
    return <SnapshotFallback title={source.title} />;
  }

  return (
    <div style={{ border: '1px solid #d1d5db', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
      <div style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb', padding: '0.45rem 0.7rem' }}>
        <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#334155' }}>{source.title}</div>
      </div>
      <img
        src={source.src}
        alt={source.title}
        style={{ width: '100%', display: 'block', objectFit: 'cover' }}
        loading="lazy"
        onError={() => setLoadFailed(true)}
      />
    </div>
  );
}

export function HelpPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [selectedRole, setSelectedRole] = useState<TrainingRole>(() => normalizeRole(user?.role));
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});

  const guide = roleGuides[selectedRole];

  const completion = useMemo(() => {
    const total = guide.steps.length;
    const done = guide.steps.filter((step) => completedSteps[step.id]).length;
    return {
      done,
      total,
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  }, [guide.steps, completedSteps]);

  const toggleStepComplete = (stepId: string) => {
    setCompletedSteps((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  return (
    <div className="content-card">
      <div className="section-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="eyebrow">Training</div>
          <h1>Role-Based Training Center</h1>
          <p className="muted" style={{ maxWidth: 760 }}>
            First-time user onboarding with role-specific workflows, visual snapshots, and step-by-step checklists.
          </p>
        </div>
        <div style={{ minWidth: 220 }}>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>Progress</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
            {completion.done}/{completion.total} steps
          </div>
          <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
            <div style={{ width: `${completion.percent}%`, height: '100%', background: '#2563eb' }} />
          </div>
        </div>
      </div>

      <div style={{ padding: '0 1.5rem 1.5rem 1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem' }}>
          {(Object.keys(roleGuides) as TrainingRole[]).map((role) => (
            <button
              key={role}
              type="button"
              className={selectedRole === role ? '' : 'ghost'}
              onClick={() => setSelectedRole(role)}
              style={{ minWidth: 130 }}
            >
              {roleGuides[role].label}
            </button>
          ))}
        </div>

        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: '1rem',
          marginBottom: '1rem',
        }}>
          <h2 style={{ margin: 0, marginBottom: '0.45rem', fontSize: '1.05rem', color: '#0f172a' }}>
            {guide.label} Onboarding Plan
          </h2>
          <p style={{ margin: 0, marginBottom: '0.7rem', color: '#475569', fontSize: '0.9rem' }}>{guide.intro}</p>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.45rem' }}>First-Day Checklist</div>
            <ul style={{ margin: 0, paddingLeft: '1.15rem', color: '#475569', fontSize: '0.86rem', lineHeight: 1.55 }}>
              {guide.firstDayChecklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          {guide.steps.map((step, index) => {
            const done = Boolean(completedSteps[step.id]);
            return (
              <article key={step.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', gap: '0.8rem' }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginBottom: 2 }}>STEP {index + 1}</div>
                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>{step.title}</h3>
                    <p style={{ margin: '0.4rem 0 0', color: '#475569', fontSize: '0.87rem' }}>{step.objective}</p>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleStepComplete(step.id)}
                      className={done ? '' : 'ghost'}
                      style={{ minWidth: 130 }}
                    >
                      {done ? 'Completed' : 'Mark Complete'}
                    </button>
                  </div>
                </div>

                <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: '1rem' }}>
                  <div>
                    <div style={{ marginBottom: '0.85rem' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>Action Checklist</div>
                      <ol style={{ margin: 0, paddingLeft: '1.15rem', color: '#334155', fontSize: '0.86rem', lineHeight: 1.55 }}>
                        {step.checklist.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ol>
                    </div>
                    <div style={{ marginBottom: '0.85rem' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#7f1d1d', marginBottom: '0.4rem' }}>Common Mistakes to Avoid</div>
                      <ul style={{ margin: 0, paddingLeft: '1.15rem', color: '#7f1d1d', fontSize: '0.84rem', lineHeight: 1.55 }}>
                        {step.commonPitfalls.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <button type="button" className="ghost" onClick={() => navigate(step.openPath)}>
                      {step.openLabel}
                    </button>
                  </div>

                  <div>
                    <SnapshotImage variant={step.snapshot} />
                    <p style={{ margin: '0.55rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                      Snapshot shows where the action area is located for this workflow.
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
