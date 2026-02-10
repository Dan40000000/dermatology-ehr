import { useState, useEffect } from 'react';
import { ErythemaScale } from './ErythemaScale';

interface Course {
  id: string;
  patient_id: string;
  patient_name: string;
  protocol_id: string;
  protocol_name: string;
  light_type: string;
  fitzpatrick_skin_type: number;
  total_treatments: number;
}

interface TreatmentLoggerProps {
  course: Course;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<any>;
  onTreatmentRecorded: () => void;
  onCancel: () => void;
}

interface DoseRecommendation {
  recommendedDose: number;
  previousDose: number;
  adjustmentReason: string;
  incrementPercent: number;
  maxDose: number;
  warnings: string[];
  isMaxDose: boolean;
}

// Common body areas
const BODY_AREAS = [
  'Full body',
  'Head/Scalp',
  'Face',
  'Neck',
  'Trunk - anterior',
  'Trunk - posterior',
  'Arms - bilateral',
  'Hands',
  'Legs - bilateral',
  'Feet',
  'Palms',
  'Soles',
];

export function TreatmentLogger({
  course,
  fetchWithAuth,
  onTreatmentRecorded,
  onCancel,
}: TreatmentLoggerProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doseRecommendation, setDoseRecommendation] = useState<DoseRecommendation | null>(null);
  const [showErythemaModal, setShowErythemaModal] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    treatmentDate: new Date().toISOString().split('T')[0],
    treatmentTime: new Date().toTimeString().slice(0, 5),
    doseMj: '',
    durationSeconds: '',
    bodyAreas: [] as string[],
    skinType: course.fitzpatrick_skin_type,
    preTreatmentNotes: '',
    psoralenTaken: false,
    psoralenTime: '',
    psoralenDoseMg: '',
    eyeProtectionVerified: true,
    notes: '',
    // Previous treatment erythema (if recording for previous session)
    recordErythema: false,
    previousTreatmentId: '',
    erythemaResponse: 'none' as string,
    erythemaScore: 0,
    responseNotes: '',
  });

  // Load dose recommendation
  useEffect(() => {
    const loadDoseRecommendation = async () => {
      try {
        const recommendation = await fetchWithAuth(`/api/phototherapy/next-dose/${course.id}`);
        setDoseRecommendation(recommendation);
        // Pre-fill recommended dose
        if (recommendation.recommendedDose) {
          setFormData(prev => ({
            ...prev,
            doseMj: recommendation.recommendedDose.toString(),
          }));
        }
      } catch (err: any) {
        console.error('Failed to load dose recommendation:', err);
      } finally {
        setLoading(false);
      }
    };
    loadDoseRecommendation();
  }, [course.id, fetchWithAuth]);

  // Toggle body area
  const toggleBodyArea = (area: string) => {
    setFormData(prev => ({
      ...prev,
      bodyAreas: prev.bodyAreas.includes(area)
        ? prev.bodyAreas.filter(a => a !== area)
        : [...prev.bodyAreas, area],
    }));
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const doseMj = parseFloat(formData.doseMj);
    if (isNaN(doseMj) || doseMj <= 0) {
      setError('Please enter a valid dose');
      return;
    }

    // Warn if dose exceeds recommendation significantly
    if (doseRecommendation && doseMj > doseRecommendation.maxDose) {
      const confirm = window.confirm(
        `Warning: The dose of ${doseMj} mJ/cm2 exceeds the protocol maximum of ${doseRecommendation.maxDose} mJ/cm2. Continue?`
      );
      if (!confirm) return;
    }

    setSubmitting(true);
    try {
      const result = await fetchWithAuth(`/api/phototherapy/courses/${course.id}/treatments`, {
        method: 'POST',
        body: JSON.stringify({
          treatmentDate: formData.treatmentDate,
          treatmentTime: formData.treatmentTime || undefined,
          doseMj,
          durationSeconds: formData.durationSeconds ? parseInt(formData.durationSeconds) : undefined,
          bodyAreas: formData.bodyAreas.length > 0 ? formData.bodyAreas : undefined,
          skinType: formData.skinType,
          preTreatmentNotes: formData.preTreatmentNotes || undefined,
          psoralenTaken: formData.psoralenTaken || undefined,
          psoralenTime: formData.psoralenTime || undefined,
          psoralenDoseMg: formData.psoralenDoseMg ? parseFloat(formData.psoralenDoseMg) : undefined,
          eyeProtectionVerified: formData.eyeProtectionVerified,
          notes: formData.notes || undefined,
        }),
      });

      // Show warnings if any
      if (result.warnings && result.warnings.length > 0) {
        alert('Treatment recorded with warnings:\n' + result.warnings.join('\n'));
      }

      onTreatmentRecorded();
    } catch (err: any) {
      setError(err.message || 'Failed to record treatment');
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate duration from dose (rough estimate for display)
  const calculateDuration = (doseMj: number): string => {
    // Approximate: typical NB-UVB output is ~20 mJ/cm2 per minute
    const minutes = doseMj / 20;
    if (minutes < 1) {
      return `~${Math.round(minutes * 60)} seconds`;
    }
    return `~${minutes.toFixed(1)} minutes`;
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-500">Loading dose recommendation...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Dose Recommendation */}
      {doseRecommendation && (
        <div className={`p-4 rounded-lg ${doseRecommendation.warnings.length > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-blue-50 border border-blue-200'}`}>
          <h3 className="font-medium text-gray-900 mb-2">Dose Recommendation</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Recommended:</span>
              <span className="ml-2 font-bold text-lg">{doseRecommendation.recommendedDose} mJ/cm2</span>
            </div>
            <div>
              <span className="text-gray-500">Previous:</span>
              <span className="ml-2">{doseRecommendation.previousDose || 'N/A'} mJ/cm2</span>
            </div>
            <div>
              <span className="text-gray-500">Max Allowed:</span>
              <span className="ml-2">{doseRecommendation.maxDose} mJ/cm2</span>
            </div>
          </div>
          <p className="mt-2 text-sm text-gray-600">{doseRecommendation.adjustmentReason}</p>
          {doseRecommendation.warnings.length > 0 && (
            <div className="mt-2 text-sm text-yellow-700">
              {doseRecommendation.warnings.map((w, i) => (
                <p key={i}>- {w}</p>
              ))}
            </div>
          )}
          {doseRecommendation.isMaxDose && (
            <p className="mt-2 text-sm font-medium text-orange-600">
              Maximum protocol dose reached - cannot increase further
            </p>
          )}
        </div>
      )}

      {/* Treatment #, Date & Time */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Treatment #
          </label>
          <input
            type="text"
            value={course.total_treatments + 1}
            disabled
            className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-md"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={formData.treatmentDate}
            onChange={e => setFormData(prev => ({ ...prev, treatmentDate: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Time
          </label>
          <input
            type="time"
            value={formData.treatmentTime}
            onChange={e => setFormData(prev => ({ ...prev, treatmentTime: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Dose Input */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dose (mJ/cm2) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="1"
            min="0"
            value={formData.doseMj}
            onChange={e => setFormData(prev => ({ ...prev, doseMj: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter dose"
          />
          {formData.doseMj && (
            <p className="mt-1 text-xs text-gray-500">
              Estimated duration: {calculateDuration(parseFloat(formData.doseMj))}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Duration (seconds)
          </label>
          <input
            type="number"
            min="0"
            value={formData.durationSeconds}
            onChange={e => setFormData(prev => ({ ...prev, durationSeconds: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Actual duration"
          />
        </div>
      </div>

      {/* Body Areas */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Body Areas Treated
        </label>
        <div className="flex flex-wrap gap-2">
          {BODY_AREAS.map(area => (
            <button
              key={area}
              type="button"
              onClick={() => toggleBodyArea(area)}
              className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                formData.bodyAreas.includes(area)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {area}
            </button>
          ))}
        </div>
      </div>

      {/* PUVA-specific fields */}
      {course.light_type === 'PUVA' && (
        <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
          <h4 className="font-medium text-orange-900 mb-3">PUVA Treatment Details</h4>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="psoralenTaken"
                checked={formData.psoralenTaken}
                onChange={e => setFormData(prev => ({ ...prev, psoralenTaken: e.target.checked }))}
                className="h-4 w-4 text-orange-600 rounded"
              />
              <label htmlFor="psoralenTaken" className="ml-2 text-sm text-gray-700">
                Psoralen Taken
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time Taken
              </label>
              <input
                type="time"
                value={formData.psoralenTime}
                onChange={e => setFormData(prev => ({ ...prev, psoralenTime: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dose (mg)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.psoralenDoseMg}
                onChange={e => setFormData(prev => ({ ...prev, psoralenDoseMg: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Safety Verification */}
      <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
        <input
          type="checkbox"
          id="eyeProtection"
          checked={formData.eyeProtectionVerified}
          onChange={e => setFormData(prev => ({ ...prev, eyeProtectionVerified: e.target.checked }))}
          className="h-5 w-5 text-green-600 rounded"
        />
        <label htmlFor="eyeProtection" className="text-sm font-medium text-gray-700">
          Eye protection verified (goggles provided)
        </label>
      </div>

      {/* Pre-treatment Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Pre-treatment Notes
        </label>
        <textarea
          value={formData.preTreatmentNotes}
          onChange={e => setFormData(prev => ({ ...prev, preTreatmentNotes: e.target.value }))}
          rows={2}
          placeholder="Any observations before treatment..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Additional Notes
        </label>
        <textarea
          value={formData.notes}
          onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          rows={2}
          placeholder="Any additional notes..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={() => setShowErythemaModal(true)}
          className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Record Previous Erythema
        </button>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Recording...' : 'Record Treatment'}
          </button>
        </div>
      </div>

      {/* Erythema Modal - simplified for now */}
      {showErythemaModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Record Erythema Response</h3>
            <ErythemaScale
              value={formData.erythemaResponse}
              onChange={(response) => setFormData(prev => ({ ...prev, erythemaResponse: response }))}
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowErythemaModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
