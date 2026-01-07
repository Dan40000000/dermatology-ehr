import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import {
  fetchAIAgentConfigs,
  fetchAIAgentConfig,
  createAIAgentConfig,
  updateAIAgentConfig,
  deleteAIAgentConfig,
  cloneAIAgentConfig,
  AIAgentConfiguration,
  CreateAIAgentConfigInput,
} from '../api';

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)',
  padding: '2rem',
};

const containerStyle: React.CSSProperties = {
  maxWidth: '1400px',
  margin: '0 auto',
};

const headerStyle: React.CSSProperties = {
  marginBottom: '2rem',
};

const titleStyle: React.CSSProperties = {
  fontSize: '2.5rem',
  fontWeight: 800,
  color: 'white',
  marginBottom: '0.5rem',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '1.125rem',
  color: 'rgba(255, 255, 255, 0.7)',
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.95)',
  borderRadius: '1.5rem',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
  padding: '2rem',
  backdropFilter: 'blur(20px)',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '1rem',
  borderBottom: '2px solid #e5e7eb',
  fontWeight: 600,
  color: '#374151',
  fontSize: '0.875rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
  padding: '1rem',
  borderBottom: '1px solid #f3f4f6',
  color: '#111827',
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: '0.75rem 1.5rem',
  borderRadius: '0.75rem',
  border: 'none',
  background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
  color: 'white',
  fontSize: '1rem',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
};

const btnSecondaryStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '0.5rem',
  border: '1px solid #d1d5db',
  background: 'white',
  color: '#374151',
  fontSize: '0.875rem',
  fontWeight: 500,
  cursor: 'pointer',
};

const btnDangerStyle: React.CSSProperties = {
  ...btnSecondaryStyle,
  borderColor: '#fca5a5',
  color: '#dc2626',
};

const formGroupStyle: React.CSSProperties = {
  marginBottom: '1.5rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.5rem',
  fontWeight: 600,
  color: '#374151',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem 1rem',
  borderRadius: '0.5rem',
  border: '2px solid #e5e7eb',
  fontSize: '1rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: '120px',
  resize: 'vertical',
  fontFamily: 'monospace',
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  backdropFilter: 'blur(4px)',
  overflow: 'auto',
  padding: '2rem',
};

const modalStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: '1.5rem',
  padding: '2rem',
  width: '100%',
  maxWidth: '800px',
  maxHeight: '90vh',
  overflow: 'auto',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
};

const modalTitleStyle: React.CSSProperties = {
  fontSize: '1.5rem',
  fontWeight: 700,
  color: '#111827',
  marginBottom: '1.5rem',
};

const badgeActiveStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.25rem 0.75rem',
  borderRadius: '9999px',
  fontSize: '0.75rem',
  fontWeight: 600,
  background: '#dcfce7',
  color: '#166534',
};

const badgeInactiveStyle: React.CSSProperties = {
  ...badgeActiveStyle,
  background: '#fee2e2',
  color: '#991b1b',
};

const badgeDefaultStyle: React.CSSProperties = {
  ...badgeActiveStyle,
  background: '#dbeafe',
  color: '#1e40af',
};

const specialtyColors: Record<string, { bg: string; text: string }> = {
  medical_derm: { bg: '#dbeafe', text: '#1e40af' },
  cosmetic: { bg: '#fce7f3', text: '#9d174d' },
  mohs: { bg: '#fef3c7', text: '#92400e' },
  pediatric_derm: { bg: '#dcfce7', text: '#166534' },
  general: { bg: '#e5e7eb', text: '#374151' },
};

const specialtyLabels: Record<string, string> = {
  medical_derm: 'Medical Dermatology',
  cosmetic: 'Cosmetic',
  mohs: 'Mohs Surgery',
  pediatric_derm: 'Pediatric Derm',
  general: 'General',
};

export function AIAgentConfigsPage() {
  const { session, user } = useAuth();
  const [configs, setConfigs] = useState<AIAgentConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AIAgentConfiguration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [cloneSourceId, setCloneSourceId] = useState<string | null>(null);

  // Redirect non-admin users
  if (user?.role !== 'admin') {
    return <Navigate to="/home" replace />;
  }

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);

    try {
      const data = await fetchAIAgentConfigs(session.tenantId, session.accessToken, { activeOnly: false });
      setConfigs(data.configurations || []);
    } catch (err: any) {
      console.error('Error loading configurations:', err);
      setError(err.message || 'Failed to load configurations');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (data: CreateAIAgentConfigInput) => {
    if (!session) return;

    try {
      if (editingConfig?.id) {
        await updateAIAgentConfig(session.tenantId, session.accessToken, editingConfig.id, data);
      } else {
        await createAIAgentConfig(session.tenantId, session.accessToken, data);
      }
      setShowModal(false);
      setEditingConfig(null);
      loadConfigs();
    } catch (err: any) {
      console.error('Error saving configuration:', err);
      alert(err.message || 'Failed to save configuration');
    }
  };

  const handleDelete = async (id: string) => {
    if (!session || !confirm('Are you sure you want to delete this configuration?')) return;

    try {
      await deleteAIAgentConfig(session.tenantId, session.accessToken, id);
      loadConfigs();
    } catch (err: any) {
      console.error('Error deleting configuration:', err);
      alert(err.message || 'Failed to delete configuration');
    }
  };

  const handleClone = async () => {
    if (!session || !cloneSourceId || !cloneName.trim()) return;

    try {
      await cloneAIAgentConfig(session.tenantId, session.accessToken, cloneSourceId, cloneName.trim());
      setShowCloneModal(false);
      setCloneName('');
      setCloneSourceId(null);
      loadConfigs();
    } catch (err: any) {
      console.error('Error cloning configuration:', err);
      alert(err.message || 'Failed to clone configuration');
    }
  };

  const handleToggleActive = async (config: AIAgentConfiguration) => {
    if (!session) return;

    try {
      await updateAIAgentConfig(session.tenantId, session.accessToken, config.id, { isActive: !config.isActive });
      loadConfigs();
    } catch (err: any) {
      console.error('Error toggling configuration:', err);
      alert(err.message || 'Failed to update configuration');
    }
  };

  const openAddModal = () => {
    setEditingConfig(null);
    setShowModal(true);
  };

  const openEditModal = async (config: AIAgentConfiguration) => {
    if (!session) return;
    try {
      const data = await fetchAIAgentConfig(session.tenantId, session.accessToken, config.id);
      setEditingConfig(data.configuration);
      setShowModal(true);
    } catch (err: any) {
      console.error('Error loading configuration:', err);
      alert(err.message || 'Failed to load configuration');
    }
  };

  const openCloneModal = (configId: string) => {
    setCloneSourceId(configId);
    setCloneName('');
    setShowCloneModal(true);
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>AI Agent Configurations</h1>
          <p style={subtitleStyle}>
            Create and manage AI scribe templates for different visit types
          </p>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
              Configurations
            </h2>
            <button onClick={openAddModal} style={btnPrimaryStyle}>
              + Add Configuration
            </button>
          </div>

          {error && (
            <div style={{ padding: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '0.5rem', marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              Loading configurations...
            </div>
          ) : configs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              No configurations found. Create your first AI agent configuration.
            </div>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Specialty</th>
                  <th style={thStyle}>Output Format</th>
                  <th style={thStyle}>Sections</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((config) => (
                  <tr key={config.id}>
                    <td style={tdStyle}>
                      <div>
                        <strong>{config.name}</strong>
                        {config.isDefault && (
                          <span style={{ ...badgeDefaultStyle, marginLeft: '0.5rem' }}>Default</span>
                        )}
                      </div>
                      {config.description && (
                        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          {config.description}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {config.specialtyFocus && (
                        <span style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: specialtyColors[config.specialtyFocus]?.bg || '#e5e7eb',
                          color: specialtyColors[config.specialtyFocus]?.text || '#374151',
                        }}>
                          {specialtyLabels[config.specialtyFocus] || config.specialtyFocus}
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ textTransform: 'capitalize' }}>
                        {config.outputFormat?.replace('_', ' ') || 'SOAP'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        {config.noteSections?.length || 0} sections
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={config.isActive ? badgeActiveStyle : badgeInactiveStyle}>
                        {config.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button onClick={() => openEditModal(config)} style={btnSecondaryStyle}>
                          Edit
                        </button>
                        <button onClick={() => openCloneModal(config.id)} style={btnSecondaryStyle}>
                          Clone
                        </button>
                        <button
                          onClick={() => handleToggleActive(config)}
                          style={{ ...btnSecondaryStyle, color: config.isActive ? '#dc2626' : '#059669' }}
                        >
                          {config.isActive ? 'Disable' : 'Enable'}
                        </button>
                        {!config.isDefault && (
                          <button onClick={() => handleDelete(config.id)} style={btnDangerStyle}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {showModal && (
          <ConfigModal
            config={editingConfig}
            onClose={() => { setShowModal(false); setEditingConfig(null); }}
            onSave={handleSave}
          />
        )}

        {showCloneModal && (
          <div style={modalOverlayStyle} onClick={() => setShowCloneModal(false)}>
            <div style={{ ...modalStyle, maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
              <h2 style={modalTitleStyle}>Clone Configuration</h2>
              <div style={formGroupStyle}>
                <label style={labelStyle}>New Configuration Name *</label>
                <input
                  type="text"
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  style={inputStyle}
                  placeholder="My Custom Configuration"
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCloneModal(false)}
                  style={{ ...btnSecondaryStyle, flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleClone}
                  disabled={!cloneName.trim()}
                  style={{ ...btnPrimaryStyle, flex: 1, opacity: cloneName.trim() ? 1 : 0.5 }}
                >
                  Clone
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ConfigModal({
  config,
  onClose,
  onSave,
}: {
  config: AIAgentConfiguration | null;
  onClose: () => void;
  onSave: (data: CreateAIAgentConfigInput) => void;
}) {
  const [formData, setFormData] = useState<CreateAIAgentConfigInput>({
    name: config?.name || '',
    description: config?.description || '',
    isDefault: config?.isDefault || false,
    specialtyFocus: config?.specialtyFocus || 'general',
    aiModel: config?.aiModel || 'claude-3-5-sonnet-20241022',
    temperature: config?.temperature ?? 0.3,
    maxTokens: config?.maxTokens || 4000,
    systemPrompt: config?.systemPrompt || getDefaultSystemPrompt(),
    promptTemplate: config?.promptTemplate || getDefaultPromptTemplate(),
    noteSections: config?.noteSections || ['chiefComplaint', 'hpi', 'physicalExam', 'assessment', 'plan'],
    outputFormat: config?.outputFormat || 'soap',
    verbosityLevel: config?.verbosityLevel || 'standard',
    includeCodes: config?.includeCodes ?? true,
  });

  const [activeTab, setActiveTab] = useState<'basic' | 'prompts' | 'sections' | 'advanced'>('basic');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleChange = (field: keyof CreateAIAgentConfigInput, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleSectionToggle = (section: string) => {
    const sections = formData.noteSections || [];
    if (sections.includes(section)) {
      handleChange('noteSections', sections.filter((s) => s !== section));
    } else {
      handleChange('noteSections', [...sections, section]);
    }
  };

  const availableSections = [
    { key: 'chiefComplaint', label: 'Chief Complaint' },
    { key: 'hpi', label: 'History of Present Illness' },
    { key: 'ros', label: 'Review of Systems' },
    { key: 'pastMedicalHistory', label: 'Past Medical History' },
    { key: 'medications', label: 'Current Medications' },
    { key: 'allergies', label: 'Allergies' },
    { key: 'socialHistory', label: 'Social History' },
    { key: 'familyHistory', label: 'Family History' },
    { key: 'physicalExam', label: 'Physical Exam' },
    { key: 'skinExam', label: 'Skin Examination' },
    { key: 'assessment', label: 'Assessment' },
    { key: 'plan', label: 'Plan' },
    { key: 'procedureNote', label: 'Procedure Note' },
    { key: 'pathologyFindings', label: 'Pathology Findings' },
    { key: 'cosmeticConsult', label: 'Cosmetic Consultation' },
    { key: 'patientEducation', label: 'Patient Education' },
    { key: 'followUp', label: 'Follow-up' },
  ];

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '0.75rem 1.25rem',
    borderRadius: '0.5rem',
    border: 'none',
    background: isActive ? '#8b5cf6' : 'transparent',
    color: isActive ? 'white' : '#6b7280',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
  });

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={modalTitleStyle}>
          {config?.id ? 'Edit Configuration' : 'New AI Agent Configuration'}
        </h2>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: '#f3f4f6', padding: '0.5rem', borderRadius: '0.75rem' }}>
          <button onClick={() => setActiveTab('basic')} style={tabStyle(activeTab === 'basic')}>
            Basic Info
          </button>
          <button onClick={() => setActiveTab('prompts')} style={tabStyle(activeTab === 'prompts')}>
            Prompts
          </button>
          <button onClick={() => setActiveTab('sections')} style={tabStyle(activeTab === 'sections')}>
            Sections
          </button>
          <button onClick={() => setActiveTab('advanced')} style={tabStyle(activeTab === 'advanced')}>
            Advanced
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {activeTab === 'basic' && (
            <>
              <div style={formGroupStyle}>
                <label style={labelStyle}>Configuration Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  required
                  style={inputStyle}
                  placeholder="e.g., Medical Dermatology Standard"
                />
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Description</label>
                <input
                  type="text"
                  value={formData.description || ''}
                  onChange={(e) => handleChange('description', e.target.value)}
                  style={inputStyle}
                  placeholder="Brief description of this configuration"
                />
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Specialty Focus</label>
                <select
                  value={formData.specialtyFocus || 'general'}
                  onChange={(e) => handleChange('specialtyFocus', e.target.value)}
                  style={selectStyle}
                >
                  <option value="general">General</option>
                  <option value="medical_derm">Medical Dermatology</option>
                  <option value="cosmetic">Cosmetic</option>
                  <option value="mohs">Mohs Surgery</option>
                  <option value="pediatric_derm">Pediatric Dermatology</option>
                </select>
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Output Format</label>
                <select
                  value={formData.outputFormat || 'soap'}
                  onChange={(e) => handleChange('outputFormat', e.target.value)}
                  style={selectStyle}
                >
                  <option value="soap">SOAP Note</option>
                  <option value="narrative">Narrative</option>
                  <option value="procedure_note">Procedure Note</option>
                </select>
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Verbosity Level</label>
                <select
                  value={formData.verbosityLevel || 'standard'}
                  onChange={(e) => handleChange('verbosityLevel', e.target.value)}
                  style={selectStyle}
                >
                  <option value="concise">Concise</option>
                  <option value="standard">Standard</option>
                  <option value="detailed">Detailed</option>
                </select>
              </div>

              <div style={formGroupStyle}>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={formData.includeCodes ?? true}
                    onChange={(e) => handleChange('includeCodes', e.target.checked)}
                    style={{ width: '1.25rem', height: '1.25rem' }}
                  />
                  Include ICD-10 and CPT code suggestions
                </label>
              </div>
            </>
          )}

          {activeTab === 'prompts' && (
            <>
              <div style={formGroupStyle}>
                <label style={labelStyle}>System Prompt *</label>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  Instructions that define the AI's role and behavior
                </p>
                <textarea
                  value={formData.systemPrompt}
                  onChange={(e) => handleChange('systemPrompt', e.target.value)}
                  required
                  style={{ ...textareaStyle, minHeight: '200px' }}
                  placeholder="You are a dermatology clinical documentation specialist..."
                />
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Prompt Template *</label>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  Template for generating notes. Use {'{{transcript}}'} as a placeholder.
                </p>
                <textarea
                  value={formData.promptTemplate}
                  onChange={(e) => handleChange('promptTemplate', e.target.value)}
                  required
                  style={{ ...textareaStyle, minHeight: '200px' }}
                  placeholder="Based on the following clinical encounter transcript, generate a structured clinical note..."
                />
              </div>
            </>
          )}

          {activeTab === 'sections' && (
            <>
              <div style={formGroupStyle}>
                <label style={labelStyle}>Note Sections</label>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
                  Select which sections to include in generated notes
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                  {availableSections.map((section) => (
                    <label
                      key={section.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem',
                        background: formData.noteSections?.includes(section.key) ? '#f3e8ff' : '#f9fafb',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        border: formData.noteSections?.includes(section.key) ? '2px solid #8b5cf6' : '2px solid transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.noteSections?.includes(section.key) || false}
                        onChange={() => handleSectionToggle(section.key)}
                        style={{ width: '1.25rem', height: '1.25rem' }}
                      />
                      {section.label}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'advanced' && (
            <>
              <div style={formGroupStyle}>
                <label style={labelStyle}>AI Model</label>
                <select
                  value={formData.aiModel || 'claude-3-5-sonnet-20241022'}
                  onChange={(e) => handleChange('aiModel', e.target.value)}
                  style={selectStyle}
                >
                  <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet (Recommended)</option>
                  <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                  <option value="gpt-4-turbo-preview">GPT-4 Turbo</option>
                  <option value="gpt-4o">GPT-4o</option>
                </select>
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Temperature ({formData.temperature})</label>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  Lower values are more deterministic, higher values are more creative
                </p>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={formData.temperature ?? 0.3}
                  onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#9ca3af' }}>
                  <span>Precise (0)</span>
                  <span>Creative (1)</span>
                </div>
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Max Tokens</label>
                <input
                  type="number"
                  value={formData.maxTokens || 4000}
                  onChange={(e) => handleChange('maxTokens', parseInt(e.target.value))}
                  min={100}
                  max={16000}
                  style={inputStyle}
                />
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                  Maximum length of the generated note (100-16000)
                </p>
              </div>

              <div style={formGroupStyle}>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={formData.isDefault || false}
                    onChange={(e) => handleChange('isDefault', e.target.checked)}
                    style={{ width: '1.25rem', height: '1.25rem' }}
                  />
                  Set as default configuration
                </label>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                  This configuration will be used when no specific configuration is selected
                </p>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem' }}>
            <button type="button" onClick={onClose} style={{ ...btnSecondaryStyle, flex: 1 }}>
              Cancel
            </button>
            <button type="submit" style={{ ...btnPrimaryStyle, flex: 1 }}>
              {config?.id ? 'Save Changes' : 'Create Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function getDefaultSystemPrompt(): string {
  return `You are a board-certified dermatologist and expert clinical documentation specialist. Your task is to generate accurate, comprehensive clinical notes from encounter transcripts.

Guidelines:
- Use precise dermatological terminology
- Follow standard documentation practices
- Include all relevant clinical findings
- Be thorough but concise
- Maintain professional medical language`;
}

function getDefaultPromptTemplate(): string {
  return `Based on the following clinical encounter transcript, generate a structured clinical note.

TRANSCRIPT:
{{transcript}}

Please generate a complete clinical note with all relevant sections. Include any mentioned diagnoses, treatments, and follow-up plans. Suggest appropriate ICD-10 and CPT codes if applicable.`;
}
