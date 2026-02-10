import { useState } from 'react';
import type { Patient, Provider } from '../../types';

interface Protocol {
  id: string;
  name: string;
  condition: string;
  light_type: string;
  starting_dose?: number;
  increment_percent: number;
  max_dose?: number;
  frequency: string;
}

interface CourseSetupProps {
  protocols: Protocol[];
  patients: Patient[];
  providers: Provider[];
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<any>;
  onCourseCreated: () => void;
}

// Fitzpatrick skin types
const FITZPATRICK_TYPES = [
  { value: 1, label: 'Type I', description: 'Very fair, always burns, never tans' },
  { value: 2, label: 'Type II', description: 'Fair, usually burns, tans minimally' },
  { value: 3, label: 'Type III', description: 'Medium, sometimes burns, tans uniformly' },
  { value: 4, label: 'Type IV', description: 'Olive, rarely burns, tans well' },
  { value: 5, label: 'Type V', description: 'Brown, very rarely burns, tans very easily' },
  { value: 6, label: 'Type VI', description: 'Dark brown/black, never burns' },
];

// Common body areas for phototherapy
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

// Common conditions
const CONDITIONS = [
  'Psoriasis',
  'Vitiligo',
  'Atopic dermatitis',
  'Mycosis fungoides (CTCL)',
  'Morphea/Scleroderma',
  'Eczema',
  'Lichen planus',
  'Pityriasis rosea',
  'Pruritus',
  'Other',
];

export function CourseSetup({
  protocols,
  patients,
  providers,
  fetchWithAuth,
  onCourseCreated,
}: CourseSetupProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patientSearch, setPatientSearch] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    patientId: '',
    protocolId: '',
    providerId: '',
    fitzpatrickSkinType: 3,
    diagnosisCode: '',
    diagnosisDescription: '',
    indication: '',
    targetBodyAreas: [] as string[],
    treatmentPercentageBsa: '',
    targetTreatmentCount: '',
    clinicalNotes: '',
    precautions: '',
  });

  // Filter patients based on search
  const filteredPatients = patients.filter(p => {
    const search = patientSearch.toLowerCase();
    const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
    const mrn = (p.mrn || '').toLowerCase();
    return fullName.includes(search) || mrn.includes(search);
  }).slice(0, 20);

  // Get selected protocol details
  const selectedProtocol = protocols.find(p => p.id === formData.protocolId);

  // Handle body area toggle
  const toggleBodyArea = (area: string) => {
    setFormData(prev => ({
      ...prev,
      targetBodyAreas: prev.targetBodyAreas.includes(area)
        ? prev.targetBodyAreas.filter(a => a !== area)
        : [...prev.targetBodyAreas, area],
    }));
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.patientId) {
      setError('Please select a patient');
      return;
    }
    if (!formData.protocolId) {
      setError('Please select a protocol');
      return;
    }
    if (!formData.providerId) {
      setError('Please select a prescribing provider');
      return;
    }

    setSubmitting(true);
    try {
      await fetchWithAuth('/api/phototherapy/courses', {
        method: 'POST',
        body: JSON.stringify({
          patientId: formData.patientId,
          protocolId: formData.protocolId,
          providerId: formData.providerId,
          fitzpatrickSkinType: formData.fitzpatrickSkinType,
          diagnosisCode: formData.diagnosisCode || undefined,
          diagnosisDescription: formData.diagnosisDescription || undefined,
          indication: formData.indication || undefined,
          targetBodyAreas: formData.targetBodyAreas.length > 0 ? formData.targetBodyAreas : undefined,
          treatmentPercentageBsa: formData.treatmentPercentageBsa ? parseFloat(formData.treatmentPercentageBsa) : undefined,
          targetTreatmentCount: formData.targetTreatmentCount ? parseInt(formData.targetTreatmentCount) : undefined,
          clinicalNotes: formData.clinicalNotes || undefined,
          precautions: formData.precautions || undefined,
        }),
      });
      onCourseCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to create course');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold">Start New Phototherapy Course</h2>
        <p className="text-sm text-gray-500">Configure a new UV light therapy treatment course for a patient</p>
      </div>

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="p-4 space-y-6">
        {/* Patient Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Patient <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={patientSearch}
              onChange={e => setPatientSearch(e.target.value)}
              placeholder="Search patients by name or MRN..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {patientSearch && filteredPatients.length > 0 && !formData.patientId && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                {filteredPatients.map(patient => (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, patientId: patient.id }));
                      setPatientSearch(`${patient.firstName} ${patient.lastName}`);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center justify-between"
                  >
                    <span>{patient.firstName} {patient.lastName}</span>
                    {patient.mrn && <span className="text-sm text-gray-500">MRN: {patient.mrn}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {formData.patientId && (
            <button
              type="button"
              onClick={() => {
                setFormData(prev => ({ ...prev, patientId: '' }));
                setPatientSearch('');
              }}
              className="mt-1 text-sm text-blue-600 hover:text-blue-800"
            >
              Clear selection
            </button>
          )}
        </div>

        {/* Protocol Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Protocol Template <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.protocolId}
            onChange={e => setFormData(prev => ({ ...prev, protocolId: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a protocol...</option>
            {protocols.map(protocol => (
              <option key={protocol.id} value={protocol.id}>
                {protocol.name} ({protocol.light_type})
              </option>
            ))}
          </select>
          {selectedProtocol && (
            <div className="mt-2 p-3 bg-blue-50 rounded-md text-sm">
              <div className="font-medium text-blue-900">{selectedProtocol.name}</div>
              <div className="text-blue-700 mt-1">
                Light Type: {selectedProtocol.light_type} |
                Increment: {selectedProtocol.increment_percent}% |
                Frequency: {selectedProtocol.frequency.replace('_', ' ')}
                {selectedProtocol.max_dose && ` | Max: ${selectedProtocol.max_dose} mJ/cm2`}
              </div>
            </div>
          )}
        </div>

        {/* Provider Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Prescribing Provider <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.providerId}
            onChange={e => setFormData(prev => ({ ...prev, providerId: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a provider...</option>
            {providers.map(provider => (
              <option key={provider.id} value={provider.id}>
                {provider.fullName || provider.name}
              </option>
            ))}
          </select>
        </div>

        {/* Fitzpatrick Skin Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Fitzpatrick Skin Type <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {FITZPATRICK_TYPES.map(type => (
              <button
                key={type.value}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, fitzpatrickSkinType: type.value }))}
                className={`p-3 text-left border rounded-md transition-colors ${
                  formData.fitzpatrickSkinType === type.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium text-sm">{type.label}</div>
                <div className="text-xs text-gray-500">{type.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Diagnosis/Indication */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Diagnosis Code (ICD-10)
            </label>
            <input
              type="text"
              value={formData.diagnosisCode}
              onChange={e => setFormData(prev => ({ ...prev, diagnosisCode: e.target.value }))}
              placeholder="e.g., L40.0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Indication
            </label>
            <select
              value={formData.indication}
              onChange={e => setFormData(prev => ({
                ...prev,
                indication: e.target.value,
                diagnosisDescription: e.target.value !== 'Other' ? e.target.value : prev.diagnosisDescription,
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select indication...</option>
              {CONDITIONS.map(condition => (
                <option key={condition} value={condition}>{condition}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Body Areas */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Target Body Areas
          </label>
          <div className="flex flex-wrap gap-2">
            {BODY_AREAS.map(area => (
              <button
                key={area}
                type="button"
                onClick={() => toggleBodyArea(area)}
                className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                  formData.targetBodyAreas.includes(area)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {area}
              </button>
            ))}
          </div>
        </div>

        {/* Treatment Goals */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              BSA % Affected
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={formData.treatmentPercentageBsa}
              onChange={e => setFormData(prev => ({ ...prev, treatmentPercentageBsa: e.target.value }))}
              placeholder="e.g., 15.5"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target # of Treatments
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={formData.targetTreatmentCount}
              onChange={e => setFormData(prev => ({ ...prev, targetTreatmentCount: e.target.value }))}
              placeholder="e.g., 24"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Clinical Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Clinical Notes
          </label>
          <textarea
            value={formData.clinicalNotes}
            onChange={e => setFormData(prev => ({ ...prev, clinicalNotes: e.target.value }))}
            rows={3}
            placeholder="Any relevant clinical information..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Precautions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Precautions/Warnings
          </label>
          <textarea
            value={formData.precautions}
            onChange={e => setFormData(prev => ({ ...prev, precautions: e.target.value }))}
            rows={2}
            placeholder="e.g., Photosensitizing medications, avoid sun exposure..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Form Actions */}
      <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Start Course'}
        </button>
      </div>
    </form>
  );
}
