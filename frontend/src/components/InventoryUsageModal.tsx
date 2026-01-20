import { useState, useEffect } from 'react';
import { Modal } from './ui';
import { api } from '../api';
import { useToast } from '../contexts/ToastContext';

interface ProcedureTemplate {
  id: string;
  procedureName: string;
  procedureCode: string;
  category: string;
  description: string;
}

interface TemplateItem {
  item_id: string;
  item_name: string;
  item_sku: string;
  default_quantity: number;
  current_stock: number;
  is_optional: boolean;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
}

interface Provider {
  id: string;
  fullName: string;
}

interface InventoryUsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId?: string;
  encounterId?: string;
  appointmentId?: string;
}

export function InventoryUsageModal({
  isOpen,
  onClose,
  patientId: initialPatientId,
  encounterId,
  appointmentId,
}: InventoryUsageModalProps) {
  const { showSuccess, showError } = useToast();

  const [templates, setTemplates] = useState<ProcedureTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);
  const [patientId, setPatientId] = useState(initialPatientId || '');
  const [providerId, setProviderId] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);

  // Load templates, patients, and providers on mount
  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      fetchPatients();
      fetchProviders();
    }
  }, [isOpen]);

  // Load template items when template is selected
  useEffect(() => {
    if (selectedTemplate) {
      fetchTemplateItems(selectedTemplate);
    } else {
      setTemplateItems([]);
    }
  }, [selectedTemplate]);

  const fetchTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const response = await api.get('/inventory/procedure-templates');
      setTemplates(response.templates || []);
    } catch (error) {
      console.error('Failed to fetch procedure templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const fetchTemplateItems = async (procedureName: string) => {
    try {
      const response = await api.get(`/inventory/procedure-templates/${encodeURIComponent(procedureName)}/items`);
      setTemplateItems(response.items || []);
    } catch (error) {
      console.error('Failed to fetch template items:', error);
      showError('Failed to load procedure items');
    }
  };

  const fetchPatients = async () => {
    try {
      const response = await api.get('/patients?limit=100');
      setPatients(response.data || []);
    } catch (error) {
      console.error('Failed to fetch patients:', error);
    }
  };

  const fetchProviders = async () => {
    try {
      const response = await api.get('/users?role=provider');
      setProviders(response.users || []);
    } catch (error) {
      console.error('Failed to fetch providers:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTemplate) {
      showError('Please select a procedure');
      return;
    }

    if (!patientId) {
      showError('Please select a patient');
      return;
    }

    if (!providerId) {
      showError('Please select a provider');
      return;
    }

    try {
      setLoading(true);
      await api.post('/inventory/procedure-usage', {
        procedureName: selectedTemplate,
        patientId,
        providerId,
        encounterId,
        appointmentId,
        notes,
      });

      showSuccess('Inventory usage recorded successfully');
      onClose();
      resetForm();
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to record inventory usage');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedTemplate('');
    setTemplateItems([]);
    setNotes('');
    if (!initialPatientId) {
      setPatientId('');
    }
  };

  const selectedTemplateName = templates.find(t => t.procedureName === selectedTemplate)?.procedureName || '';

  return (
    <Modal
      isOpen={isOpen}
      title="Record Inventory Usage"
      onClose={onClose}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="modal-form">
        <div className="form-field">
          <label>Procedure *</label>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            required
            disabled={loadingTemplates}
          >
            <option value="">Select a procedure...</option>
            {templates.map((template) => (
              <option key={template.id} value={template.procedureName}>
                {template.procedureName} {template.procedureCode ? `(${template.procedureCode})` : ''}
              </option>
            ))}
          </select>
        </div>

        {templateItems.length > 0 && (
          <div className="template-items-preview">
            <h4>Items to be used:</h4>
            <div className="items-list">
              {templateItems.map((item) => (
                <div key={item.item_id} className="item-row">
                  <span className="item-name">{item.item_name}</span>
                  <span className="item-quantity">
                    {item.default_quantity} unit(s)
                  </span>
                  <span className={`item-stock ${item.current_stock < item.default_quantity ? 'warning' : ''}`}>
                    ({item.current_stock} in stock)
                  </span>
                  {item.is_optional && <span className="optional-badge">Optional</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="form-row">
          <div className="form-field">
            <label>Patient *</label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              required
              disabled={!!initialPatientId}
            >
              <option value="">Select a patient...</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.lastName}, {patient.firstName}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Provider *</label>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              required
            >
              <option value="">Select a provider...</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-field">
          <label>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes (optional)"
            rows={3}
          />
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !selectedTemplate || !patientId || !providerId}
          >
            {loading ? 'Recording...' : 'Record Usage'}
          </button>
        </div>
      </form>

      <style>{`
        .template-items-preview {
          background: #f9fafb;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          padding: 1rem;
          margin: 1rem 0;
        }

        .template-items-preview h4 {
          margin: 0 0 0.75rem 0;
          font-size: 0.9rem;
          color: #374151;
          font-weight: 600;
        }

        .items-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .item-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem;
          background: white;
          border-radius: 6px;
          font-size: 0.875rem;
        }

        .item-name {
          flex: 1;
          font-weight: 500;
          color: #1f2937;
        }

        .item-quantity {
          color: #6b7280;
          font-weight: 600;
        }

        .item-stock {
          color: #10b981;
          font-size: 0.75rem;
        }

        .item-stock.warning {
          color: #ef4444;
          font-weight: 600;
        }

        .optional-badge {
          padding: 0.125rem 0.5rem;
          background: #dbeafe;
          color: #1e40af;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .form-row {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
        }

        .form-field {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-field label {
          font-weight: 500;
          color: #374151;
        }

        .form-field input,
        .form-field select,
        .form-field textarea {
          padding: 0.625rem;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 1rem;
        }

        .form-field textarea {
          resize: vertical;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          margin-top: 1.5rem;
        }
      `}</style>
    </Modal>
  );
}
