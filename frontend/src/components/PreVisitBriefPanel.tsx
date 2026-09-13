import type { PatientDiagnosisSummary } from '../api';
import type { Encounter, Order, Patient } from '../types';

interface PreVisitBriefPanelProps {
  patient: Pick<Patient, 'allergies' | 'medications'>;
  encounter: Partial<Encounter>;
  diagnosisHistory: PatientDiagnosisSummary[];
  orders: Order[];
}

const CLOSED_ORDER_STATUSES = new Set(['closed', 'canceled', 'cancelled', 'completed', 'reviewed']);
const ACTIONABLE_RESULT_FLAGS = new Set([
  'abnormal',
  'low',
  'high',
  'out_of_range',
  'panic_value',
  'inconclusive',
  'precancerous',
  'cancerous',
]);

function normalizeChartList(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  if (!value?.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Free-text chart fields are common; split them below.
  }

  return value.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
}

function formatChartDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function withIndefiniteArticle(value: string): string {
  return /^[aeiou]/i.test(value) ? `an ${value}` : `a ${value}`;
}

function uniqueRecentDiagnoses(diagnoses: PatientDiagnosisSummary[]): PatientDiagnosisSummary[] {
  const sorted = [...diagnoses].sort((a, b) => {
    const aTime = new Date(a.encounterDate || a.createdAt || 0).getTime();
    const bTime = new Date(b.encounterDate || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
  const seen = new Set<string>();
  return sorted.filter((diagnosis) => {
    const key = `${diagnosis.icd10Code}:${diagnosis.description}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

export function PreVisitBriefPanel({ patient, encounter, diagnosisHistory, orders }: PreVisitBriefPanelProps) {
  const allergies = normalizeChartList(patient.allergies);
  const medications = normalizeChartList(patient.medications);
  const recentDiagnoses = uniqueRecentDiagnoses(diagnosisHistory);
  const openOrders = orders.filter((order) => !CLOSED_ORDER_STATUSES.has(String(order.status).toLowerCase()));
  const flaggedOrders = orders.filter((order) => ACTIONABLE_RESULT_FLAGS.has(String(order.resultFlag || '').toLowerCase()));
  const chiefComplaint = encounter.chiefComplaint?.trim();

  const confirmations = [
    !chiefComplaint ? 'Reason for today’s visit is not documented.' : null,
    allergies.length === 0 ? 'Allergies are not documented; confirm allergy status.' : null,
    medications.length === 0 ? 'Medications are not documented; complete medication reconciliation.' : null,
    ...flaggedOrders.slice(0, 2).map((order) => (
      `${order.details || order.type} has ${withIndefiniteArticle(String(order.resultFlag).replace(/_/g, ' '))} result flag.`
    )),
    ...openOrders.filter((order) => ['urgent', 'stat', 'high'].includes(String(order.priority).toLowerCase())).slice(0, 2).map((order) => (
      `${order.details || order.type} is ${order.status} and remains open with ${order.priority} priority.`
    )),
  ].filter((item): item is string => Boolean(item));

  const questions = [
    chiefComplaint
      ? `What has changed about ${chiefComplaint.toLowerCase()} since it began?`
      : 'What is the main concern you want addressed today?',
    recentDiagnoses[0]
      ? `How has ${recentDiagnoses[0].description.toLowerCase()} changed since the last visit?`
      : 'Have you noticed any new, changing, bleeding, or non-healing spots?',
    medications.length > 0
      ? 'Are you taking these medications as listed, and have you noticed any side effects?'
      : 'What prescriptions, over-the-counter products, or supplements are you taking?',
  ];

  return (
    <section className="previsit-brief" aria-labelledby="previsit-brief-title">
      <header className="previsit-brief__header">
        <div>
          <h2 id="previsit-brief-title">Pre-visit brief</h2>
          <p>Chart context and open loops to confirm before documentation begins.</p>
        </div>
        <span className="previsit-brief__verification">Chart-derived · verify with patient</span>
      </header>

      <div className="previsit-brief__grid">
        <section className="previsit-brief__card" aria-labelledby="previsit-context-title">
          <div className="previsit-brief__card-header">
            <h3 id="previsit-context-title">Visit context</h3>
            <span>Encounter + history</span>
          </div>
          <p className={chiefComplaint ? 'previsit-brief__primary' : 'previsit-brief__missing'}>
            {chiefComplaint || 'Reason for visit not recorded'}
          </p>
          {recentDiagnoses.length > 0 ? (
            <ul className="previsit-brief__list">
              {recentDiagnoses.map((diagnosis) => (
                <li key={`${diagnosis.id}:${diagnosis.icd10Code}`}>
                  <span>{diagnosis.description}</span>
                  <span>{diagnosis.icd10Code}{formatChartDate(diagnosis.encounterDate) ? ` · ${formatChartDate(diagnosis.encounterDate)}` : ''}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="previsit-brief__empty">No prior diagnoses in the available chart history.</p>
          )}
        </section>

        <section className="previsit-brief__card" aria-labelledby="previsit-safety-title">
          <div className="previsit-brief__card-header">
            <h3 id="previsit-safety-title">Safety check</h3>
            <span>Patient chart</span>
          </div>
          <dl className="previsit-brief__definition-list">
            <div>
              <dt>Allergies</dt>
              <dd className={allergies.length > 0 ? '' : 'previsit-brief__missing'}>
                {allergies.length > 0 ? allergies.join(', ') : 'Not documented'}
              </dd>
            </div>
            <div>
              <dt>Medications</dt>
              <dd className={medications.length > 0 ? '' : 'previsit-brief__missing'}>
                {medications.length > 0 ? medications.join(', ') : 'Not documented'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="previsit-brief__card" aria-labelledby="previsit-orders-title">
          <div className="previsit-brief__card-header">
            <h3 id="previsit-orders-title">Open loops</h3>
            <span>Orders</span>
          </div>
          {openOrders.length > 0 ? (
            <ul className="previsit-brief__list">
              {openOrders.slice(0, 4).map((order) => (
                <li key={order.id}>
                  <span>{order.details || order.type}</span>
                  <span>{order.priority ? `${order.priority} · ` : ''}{order.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="previsit-brief__empty">No open orders for this encounter.</p>
          )}
        </section>
      </div>

      <div className="previsit-brief__footer-grid">
        <section className="previsit-brief__confirm" aria-labelledby="previsit-confirm-title">
          <h3 id="previsit-confirm-title">Confirm before the visit</h3>
          {confirmations.length > 0 ? (
            <ul>{confirmations.map((item) => <li key={item}>{item}</li>)}</ul>
          ) : (
            <p>No obvious chart gaps or urgent open loops found.</p>
          )}
        </section>

        <section className="previsit-brief__questions" aria-labelledby="previsit-questions-title">
          <h3 id="previsit-questions-title">Suggested questions</h3>
          <ol>{questions.map((question) => <li key={question}>{question}</li>)}</ol>
        </section>
      </div>
    </section>
  );
}
