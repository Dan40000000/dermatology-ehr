import React, { useState } from 'react';
import { TestTube, X, CheckCircle, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

interface BiopsyFromLesionProps {
  lesionId: string;
  patientId: string;
  lesionLocation: string;
  lesionDescription?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface Provider {
  id: string;
  first_name: string;
  last_name: string;
}

interface PathLab {
  id: string;
  name: string;
}

export function BiopsyFromLesion({
  lesionId,
  patientId,
  lesionLocation,
  lesionDescription,
  onSuccess,
  onCancel
}: BiopsyFromLesionProps) {
  const [formData, setFormData] = useState({
    patient_id: patientId,
    lesion_id: lesionId,
    specimen_type: 'punch',
    specimen_size: '',
    body_location: lesionLocation,
    location_laterality: '',
    clinical_description: lesionDescription || '',
    clinical_history: '',
    differential_diagnoses: [] as string[],
    indication: '',
    ordering_provider_id: '',
    path_lab: '',
    path_lab_id: '',
    special_instructions: '',
    procedure_code: '88305',
  });

  const [providers, setProviders] = useState<Provider[]>([]);
  const [pathLabs, setPathLabs] = useState<PathLab[]>([]);
  const [diagnosisInput, setDiagnosisInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load providers and labs on mount
  React.useEffect(() => {
    fetchProviders();
    fetchPathLabs();
  }, []);

  const fetchProviders = async () => {
    try {
      const response = await fetch('/api/providers', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setProviders(data || []);
      }
    } catch (error) {
      console.error('Error fetching providers:', error);
    }
  };

  const fetchPathLabs = async () => {
    try {
      const response = await fetch('/api/lab-vendors?supports_dermpath=true', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setPathLabs(data || []);
      }
    } catch (error) {
      console.error('Error fetching path labs:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/biopsies', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create biopsy order');
      }

      const biopsy = await response.json();
      toast.success(`Biopsy order created: ${biopsy.specimen_id}`);
      onSuccess();
    } catch (err: any) {
      console.error('Error creating biopsy:', err);
      setError(err.message);
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const addDifferentialDiagnosis = () => {
    if (diagnosisInput.trim() && !formData.differential_diagnoses.includes(diagnosisInput.trim())) {
      setFormData({
        ...formData,
        differential_diagnoses: [...formData.differential_diagnoses, diagnosisInput.trim()],
      });
      setDiagnosisInput('');
    }
  };

  const removeDifferentialDiagnosis = (diagnosis: string) => {
    setFormData({
      ...formData,
      differential_diagnoses: formData.differential_diagnoses.filter((d) => d !== diagnosis),
    });
  };

  const commonDifferentials = [
    'Basal Cell Carcinoma',
    'Squamous Cell Carcinoma',
    'Melanoma',
    'Seborrheic Keratosis',
    'Actinic Keratosis',
    'Dermatofibroma',
    'Nevus',
  ];

  return (
    <div className="bg-white rounded-lg max-w-3xl mx-auto">
      <div className="border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-100 rounded-lg">
            <TestTube className="w-5 h-5 text-yellow-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Order Biopsy</h3>
            <p className="text-sm text-gray-500">Linked to lesion at {lesionLocation}</p>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

        {/* Specimen Details */}
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Specimen Details</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Specimen Type *
              </label>
              <select
                value={formData.specimen_type}
                onChange={(e) => setFormData({ ...formData, specimen_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                required
              >
                <option value="punch">Punch Biopsy</option>
                <option value="shave">Shave Biopsy</option>
                <option value="excisional">Excisional Biopsy</option>
                <option value="incisional">Incisional Biopsy</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {formData.specimen_type === 'punch' ? 'Punch Size' : 'Specimen Size'}
              </label>
              {formData.specimen_type === 'punch' ? (
                <select
                  value={formData.specimen_size}
                  onChange={(e) => setFormData({ ...formData, specimen_size: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="">Select size...</option>
                  <option value="2mm">2mm</option>
                  <option value="3mm">3mm</option>
                  <option value="4mm">4mm</option>
                  <option value="5mm">5mm</option>
                  <option value="6mm">6mm</option>
                  <option value="8mm">8mm</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.specimen_size}
                  onChange={(e) => setFormData({ ...formData, specimen_size: e.target.value })}
                  placeholder="e.g., 1.5 x 1.0 x 0.5 cm"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              )}
            </div>
          </div>
        </div>

        {/* Clinical Information */}
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Clinical Information</h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Clinical Description
              </label>
              <textarea
                value={formData.clinical_description}
                onChange={(e) => setFormData({ ...formData, clinical_description: e.target.value })}
                rows={3}
                placeholder="Describe the lesion appearance, size, color, borders..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Clinical History
              </label>
              <textarea
                value={formData.clinical_history}
                onChange={(e) => setFormData({ ...formData, clinical_history: e.target.value })}
                rows={2}
                placeholder="Relevant patient history, previous treatments, duration..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Differential Diagnoses
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={diagnosisInput}
                  onChange={(e) => setDiagnosisInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addDifferentialDiagnosis();
                    }
                  }}
                  placeholder="Type diagnosis..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  list="common-diagnoses"
                />
                <datalist id="common-diagnoses">
                  {commonDifferentials.map((dx) => (
                    <option key={dx} value={dx} />
                  ))}
                </datalist>
                <button
                  type="button"
                  onClick={addDifferentialDiagnosis}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.differential_diagnoses.map((dx) => (
                  <span
                    key={dx}
                    className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm flex items-center gap-1"
                  >
                    {dx}
                    <button
                      type="button"
                      onClick={() => removeDifferentialDiagnosis(dx)}
                      className="hover:bg-purple-200 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Indication for Biopsy
              </label>
              <input
                type="text"
                value={formData.indication}
                onChange={(e) => setFormData({ ...formData, indication: e.target.value })}
                placeholder="e.g., Rule out malignancy, confirm diagnosis"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
          </div>
        </div>

        {/* Provider and Lab */}
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Provider and Laboratory</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ordering Provider *
              </label>
              <select
                value={formData.ordering_provider_id}
                onChange={(e) => setFormData({ ...formData, ordering_provider_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                required
              >
                <option value="">Select provider...</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.first_name} {provider.last_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pathology Lab *
              </label>
              <select
                value={formData.path_lab_id}
                onChange={(e) => {
                  const lab = pathLabs.find((l) => l.id === e.target.value);
                  setFormData({
                    ...formData,
                    path_lab_id: e.target.value,
                    path_lab: lab?.name || '',
                  });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                required
              >
                <option value="">Select lab...</option>
                {pathLabs.map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Special Instructions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Special Instructions
          </label>
          <textarea
            value={formData.special_instructions}
            onChange={(e) => setFormData({ ...formData, special_instructions: e.target.value })}
            rows={2}
            placeholder="Any special handling or testing instructions..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end pt-4 border-t">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Creating Order...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Create Biopsy Order
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
