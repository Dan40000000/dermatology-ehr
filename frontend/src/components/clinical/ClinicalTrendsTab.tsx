import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchVitals, createVital, type Vital } from '../../api';
import { Modal } from '../ui';

interface ClinicalTrendsTabProps {
  patientId: string;
}

type TimeRange = '30days' | '6months' | '1year' | 'all';

interface VitalTrend {
  date: string;
  value: number;
  displayValue: string;
}

const NORMAL_RANGES = {
  bpSystolic: { min: 90, max: 120, unit: 'mmHg', label: 'Systolic BP' },
  bpDiastolic: { min: 60, max: 80, unit: 'mmHg', label: 'Diastolic BP' },
  pulse: { min: 60, max: 100, unit: 'bpm', label: 'Pulse' },
  tempC: { min: 36.1, max: 37.2, unit: '°C', label: 'Temperature' },
  tempF: { min: 97, max: 99, unit: '°F', label: 'Temperature' },
  weightKg: { min: null, max: null, unit: 'kg', label: 'Weight' },
  weightLbs: { min: null, max: null, unit: 'lbs', label: 'Weight' },
  heightCm: { min: null, max: null, unit: 'cm', label: 'Height' },
  respiratoryRate: { min: 12, max: 20, unit: '/min', label: 'Respiratory Rate' },
  o2Saturation: { min: 95, max: 100, unit: '%', label: 'O2 Saturation' },
  bmi: { min: 18.5, max: 24.9, unit: '', label: 'BMI' },
};

export function ClinicalTrendsTab({ patientId }: ClinicalTrendsTabProps) {
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();
  const [vitals, setVitals] = useState<Vital[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('6months');
  const [showAddModal, setShowAddModal] = useState(false);
  const [useMetric, setUseMetric] = useState(false);

  useEffect(() => {
    loadVitals();
  }, [patientId]);

  const loadVitals = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const response = await fetchVitals(session.tenantId, session.accessToken, patientId);
      setVitals(response.vitals || []);
    } catch (error: any) {
      showError(error.message || 'Failed to load vitals');
    } finally {
      setLoading(false);
    }
  };

  const filteredVitals = useMemo(() => {
    const now = new Date();
    let cutoffDate: Date;

    switch (timeRange) {
      case '30days':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '6months':
        cutoffDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case '1year':
        cutoffDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
      default:
        return vitals;
    }

    return vitals.filter(v => new Date(v.recordedAt) >= cutoffDate);
  }, [vitals, timeRange]);

  const calculateBMI = (weightKg?: number, heightCm?: number): number | null => {
    if (!weightKg || !heightCm || heightCm === 0) return null;
    const heightM = heightCm / 100;
    return weightKg / (heightM * heightM);
  };

  const getTrends = (field: keyof Vital, transform?: (val: number) => number): VitalTrend[] => {
    return filteredVitals
      .filter(v => v[field] !== null && v[field] !== undefined)
      .map(v => ({
        date: v.recordedAt,
        value: transform ? transform(v[field] as number) : (v[field] as number),
        displayValue: transform ? transform(v[field] as number).toFixed(1) : String(v[field]),
      }))
      .reverse();
  };

  const getBMITrends = (): VitalTrend[] => {
    return filteredVitals
      .map(v => {
        const bmi = calculateBMI(v.weightKg, v.heightCm);
        return bmi
          ? {
              date: v.recordedAt,
              value: bmi,
              displayValue: bmi.toFixed(1),
            }
          : null;
      })
      .filter((t): t is VitalTrend => t !== null)
      .reverse();
  };

  const handleAddVitals = () => {
    setShowAddModal(true);
  };

  const handleVitalSaved = () => {
    setShowAddModal(false);
    loadVitals();
    showSuccess('Vitals recorded successfully');
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ color: '#6b7280' }}>Loading vitals...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1400px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="ema-section-header">Clinical Trends</div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {/* Unit Toggle */}
          <button
            type="button"
            onClick={() => setUseMetric(!useMetric)}
            style={{
              padding: '0.5rem 1rem',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              color: '#374151',
            }}
          >
            {useMetric ? 'Metric' : 'Imperial'}
          </button>

          {/* Time Range Filter */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '0.875rem',
              background: '#ffffff',
            }}
          >
            <option value="30days">Last 30 Days</option>
            <option value="6months">Last 6 Months</option>
            <option value="1year">Last Year</option>
            <option value="all">All Time</option>
          </select>

          <button type="button" className="ema-action-btn" onClick={handleAddVitals}>
            <span className="icon">+</span>
            Add New Vitals
          </button>
        </div>
      </div>

      {filteredVitals.length === 0 ? (
        <div
          style={{
            background: '#f9fafb',
            border: '1px dashed #d1d5db',
            borderRadius: '8px',
            padding: '3rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No vitals recorded</h3>
          <p style={{ color: '#6b7280', margin: '0 0 1rem' }}>Record the first vitals for this patient</p>
          <button type="button" className="ema-action-btn" onClick={handleAddVitals}>
            Add Vitals
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Blood Pressure */}
          <VitalCard
            title="Blood Pressure"
            trends={[
              { label: 'Systolic', data: getTrends('bpSystolic'), color: '#dc2626', normalRange: NORMAL_RANGES.bpSystolic },
              { label: 'Diastolic', data: getTrends('bpDiastolic'), color: '#2563eb', normalRange: NORMAL_RANGES.bpDiastolic },
            ]}
            unit="mmHg"
          />

          {/* Pulse */}
          <VitalCard
            title="Pulse"
            trends={[{ label: 'Heart Rate', data: getTrends('pulse'), color: '#dc2626', normalRange: NORMAL_RANGES.pulse }]}
            unit="bpm"
          />

          {/* Temperature */}
          <VitalCard
            title="Temperature"
            trends={[
              {
                label: useMetric ? 'Celsius' : 'Fahrenheit',
                data: getTrends('tempC', useMetric ? undefined : (c) => (c * 9) / 5 + 32),
                color: '#f59e0b',
                normalRange: useMetric ? NORMAL_RANGES.tempC : NORMAL_RANGES.tempF,
              },
            ]}
            unit={useMetric ? '°C' : '°F'}
          />

          {/* Weight */}
          <VitalCard
            title="Weight"
            trends={[
              {
                label: useMetric ? 'Kilograms' : 'Pounds',
                data: getTrends('weightKg', useMetric ? undefined : (kg) => kg * 2.20462),
                color: '#8b5cf6',
                normalRange: useMetric ? NORMAL_RANGES.weightKg : NORMAL_RANGES.weightLbs,
              },
            ]}
            unit={useMetric ? 'kg' : 'lbs'}
          />

          {/* BMI */}
          <VitalCard
            title="BMI (Body Mass Index)"
            trends={[{ label: 'BMI', data: getBMITrends(), color: '#10b981', normalRange: NORMAL_RANGES.bmi }]}
            unit=""
          />

          {/* Respiratory Rate */}
          <VitalCard
            title="Respiratory Rate"
            trends={[
              {
                label: 'Breaths per Minute',
                data: getTrends('respiratoryRate'),
                color: '#06b6d4',
                normalRange: NORMAL_RANGES.respiratoryRate,
              },
            ]}
            unit="/min"
          />

          {/* O2 Saturation */}
          <VitalCard
            title="Oxygen Saturation"
            trends={[
              {
                label: 'SpO2',
                data: getTrends('o2Saturation'),
                color: '#0369a1',
                normalRange: NORMAL_RANGES.o2Saturation,
              },
            ]}
            unit="%"
          />
        </div>
      )}

      {showAddModal && (
        <AddVitalsModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          patientId={patientId}
          onSaved={handleVitalSaved}
        />
      )}
    </div>
  );
}

interface VitalCardProps {
  title: string;
  trends: Array<{
    label: string;
    data: VitalTrend[];
    color: string;
    normalRange?: { min: number | null; max: number | null; unit: string; label: string };
  }>;
  unit: string;
}

function VitalCard({ title, trends, unit }: VitalCardProps) {
  const hasData = trends.some(t => t.data.length > 0);

  if (!hasData) {
    return null;
  }

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '1.5rem',
      }}
    >
      <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>{title}</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Chart */}
        <div>
          {trends.map((trend, idx) => (
            <div key={idx} style={{ marginBottom: '1.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                  fontSize: '0.875rem',
                  color: '#6b7280',
                }}
              >
                <div style={{ width: '12px', height: '12px', background: trend.color, borderRadius: '2px' }} />
                <span>{trend.label}</span>
              </div>
              <TrendChart data={trend.data} color={trend.color} normalRange={trend.normalRange} />
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          <table className="ema-table" style={{ fontSize: '0.875rem' }}>
            <thead>
              <tr>
                <th>Date</th>
                {trends.map((trend, idx) => (
                  <th key={idx}>{trend.label}</th>
                ))}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {getAllDates(trends).map((date, idx) => (
                <tr key={idx}>
                  <td>{new Date(date).toLocaleDateString()}</td>
                  {trends.map((trend, tIdx) => {
                    const entry = trend.data.find(d => d.date === date);
                    return <td key={tIdx}>{entry ? `${entry.displayValue} ${unit}` : '—'}</td>;
                  })}
                  <td>{getStatusBadge(trends, date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Normal Range Indicator */}
      {trends[0]?.normalRange && (trends[0].normalRange.min !== null || trends[0].normalRange.max !== null) && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            background: '#f0fdf4',
            border: '1px solid #10b981',
            borderRadius: '4px',
            fontSize: '0.875rem',
            color: '#047857',
          }}
        >
          Normal Range: {trends[0].normalRange.min !== null ? trends[0].normalRange.min : '—'} -{' '}
          {trends[0].normalRange.max !== null ? trends[0].normalRange.max : '—'} {trends[0].normalRange.unit}
        </div>
      )}
    </div>
  );
}

function TrendChart({
  data,
  color,
  normalRange,
}: {
  data: VitalTrend[];
  color: string;
  normalRange?: { min: number | null; max: number | null };
}) {
  if (data.length === 0) {
    return <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No data available</div>;
  }

  const values = data.map(d => d.value);
  const minValue = normalRange?.min !== null ? Math.min(...values, normalRange.min) : Math.min(...values);
  const maxValue = normalRange?.max !== null ? Math.max(...values, normalRange.max) : Math.max(...values);
  const range = maxValue - minValue || 1;
  const padding = range * 0.1;

  return (
    <div style={{ position: 'relative', height: '150px', background: '#f9fafb', borderRadius: '4px', padding: '1rem' }}>
      {/* Normal Range Background */}
      {normalRange && normalRange.min !== null && normalRange.max !== null && (
        <div
          style={{
            position: 'absolute',
            left: '1rem',
            right: '1rem',
            top: `${((maxValue + padding - normalRange.max) / (range + 2 * padding)) * 100}%`,
            height: `${((normalRange.max - normalRange.min) / (range + 2 * padding)) * 100}%`,
            background: '#d1fae5',
            opacity: 0.3,
            borderRadius: '2px',
          }}
        />
      )}

      {/* Simple line chart using SVG */}
      <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
        {/* Draw line */}
        {data.length > 1 && (
          <polyline
            points={data
              .map((d, i) => {
                const x = (i / (data.length - 1)) * 100;
                const y = ((maxValue + padding - d.value) / (range + 2 * padding)) * 100;
                return `${x}%,${y}%`;
              })
              .join(' ')}
            fill="none"
            stroke={color}
            strokeWidth="2"
          />
        )}

        {/* Draw points */}
        {data.map((d, i) => {
          const x = (i / (data.length - 1)) * 100;
          const y = ((maxValue + padding - d.value) / (range + 2 * padding)) * 100;
          return (
            <circle
              key={i}
              cx={`${x}%`}
              cy={`${y}%`}
              r="4"
              fill={color}
              style={{ cursor: 'pointer' }}
            >
              <title>{`${new Date(d.date).toLocaleDateString()}: ${d.displayValue}`}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}

function getAllDates(trends: Array<{ data: VitalTrend[] }>): string[] {
  const allDates = new Set<string>();
  trends.forEach(trend => {
    trend.data.forEach(d => allDates.add(d.date));
  });
  return Array.from(allDates).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
}

function getStatusBadge(
  trends: Array<{ data: VitalTrend[]; normalRange?: { min: number | null; max: number | null } }>,
  date: string
): JSX.Element {
  let isNormal = true;

  for (const trend of trends) {
    const entry = trend.data.find(d => d.date === date);
    if (entry && trend.normalRange) {
      const { min, max } = trend.normalRange;
      if ((min !== null && entry.value < min) || (max !== null && entry.value > max)) {
        isNormal = false;
        break;
      }
    }
  }

  return (
    <span
      style={{
        padding: '0.25rem 0.5rem',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: 600,
        background: isNormal ? '#d1fae5' : '#fee2e2',
        color: isNormal ? '#047857' : '#dc2626',
      }}
    >
      {isNormal ? 'Normal' : 'Abnormal'}
    </span>
  );
}

function AddVitalsModal({
  isOpen,
  onClose,
  patientId,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  onSaved: () => void;
}) {
  const { session } = useAuth();
  const { showError } = useToast();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    bpSystolic: '',
    bpDiastolic: '',
    pulse: '',
    tempC: '',
    weightKg: '',
    heightCm: '',
    respiratoryRate: '',
    o2Saturation: '',
    recordedAt: new Date().toISOString().slice(0, 16),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    setSaving(true);
    try {
      await createVital(session.tenantId, session.accessToken, {
        patientId,
        bpSystolic: formData.bpSystolic ? Number(formData.bpSystolic) : undefined,
        bpDiastolic: formData.bpDiastolic ? Number(formData.bpDiastolic) : undefined,
        pulse: formData.pulse ? Number(formData.pulse) : undefined,
        tempC: formData.tempC ? Number(formData.tempC) : undefined,
        weightKg: formData.weightKg ? Number(formData.weightKg) : undefined,
        heightCm: formData.heightCm ? Number(formData.heightCm) : undefined,
        respiratoryRate: formData.respiratoryRate ? Number(formData.respiratoryRate) : undefined,
        o2Saturation: formData.o2Saturation ? Number(formData.o2Saturation) : undefined,
        recordedAt: formData.recordedAt,
      });
      onSaved();
    } catch (error: any) {
      showError(error.message || 'Failed to save vitals');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record New Vitals" size="lg">
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          {/* Date/Time */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Recorded Date & Time
            </label>
            <input
              type="datetime-local"
              value={formData.recordedAt}
              onChange={e => setFormData({ ...formData, recordedAt: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>

          {/* Blood Pressure */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              BP Systolic (mmHg)
            </label>
            <input
              type="number"
              value={formData.bpSystolic}
              onChange={e => setFormData({ ...formData, bpSystolic: e.target.value })}
              placeholder="120"
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              BP Diastolic (mmHg)
            </label>
            <input
              type="number"
              value={formData.bpDiastolic}
              onChange={e => setFormData({ ...formData, bpDiastolic: e.target.value })}
              placeholder="80"
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>

          {/* Pulse */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Pulse (bpm)
            </label>
            <input
              type="number"
              value={formData.pulse}
              onChange={e => setFormData({ ...formData, pulse: e.target.value })}
              placeholder="72"
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>

          {/* Temperature */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Temperature (°C)
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.tempC}
              onChange={e => setFormData({ ...formData, tempC: e.target.value })}
              placeholder="37.0"
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>

          {/* Weight */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Weight (kg)
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.weightKg}
              onChange={e => setFormData({ ...formData, weightKg: e.target.value })}
              placeholder="70.0"
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>

          {/* Height */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Height (cm)
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.heightCm}
              onChange={e => setFormData({ ...formData, heightCm: e.target.value })}
              placeholder="170.0"
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>

          {/* Respiratory Rate */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Respiratory Rate (/min)
            </label>
            <input
              type="number"
              value={formData.respiratoryRate}
              onChange={e => setFormData({ ...formData, respiratoryRate: e.target.value })}
              placeholder="16"
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>

          {/* O2 Saturation */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              O2 Saturation (%)
            </label>
            <input
              type="number"
              value={formData.o2Saturation}
              onChange={e => setFormData({ ...formData, o2Saturation: e.target.value })}
              placeholder="98"
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '0.5rem 1rem',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '0.5rem 1rem',
              background: '#0369a1',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save Vitals'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
