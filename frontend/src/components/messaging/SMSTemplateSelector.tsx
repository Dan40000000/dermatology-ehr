/**
 * SMSTemplateSelector Component
 * Modal for selecting and previewing SMS message templates
 */

import { useState, useEffect, useCallback } from 'react';
import type { FC } from 'react';

interface SMSTemplate {
  id: string;
  name: string;
  description: string | null;
  messageBody: string;
  category: string;
  variables: string[];
  usageCount: number;
  isSystemTemplate: boolean;
}

interface SMSTemplateSelectorProps {
  tenantId: string;
  accessToken: string;
  onSelect: (templateBody: string, templateId: string) => void;
  onClose: () => void;
  patientData?: {
    firstName?: string;
    lastName?: string;
    providerName?: string;
    appointmentDate?: string;
    appointmentTime?: string;
    clinicPhone?: string;
    clinicName?: string;
  };
}

const categoryIcons: Record<string, JSX.Element> = {
  appointment_reminder: (
    <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  follow_up: (
    <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  billing: (
    <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  recall: (
    <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
  general: (
    <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  ),
  instructions: (
    <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  education: (
    <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
};

const categoryLabels: Record<string, string> = {
  appointment_reminder: 'Appointment Reminders',
  follow_up: 'Follow-up Messages',
  billing: 'Billing & Payments',
  recall: 'Recall Reminders',
  general: 'General Messages',
  instructions: 'Patient Instructions',
  education: 'Educational Content',
};

export const SMSTemplateSelector: FC<SMSTemplateSelectorProps> = ({
  tenantId,
  accessToken,
  onSelect,
  onClose,
  patientData,
}) => {
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<SMSTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchTemplates = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/sms/templates?activeOnly=true', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-tenant-id': tenantId,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load templates');
      }

      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [tenantId, accessToken]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Get unique categories
  const categories = Array.from(new Set(templates.map(t => t.category))).sort();

  // Filter templates
  const filteredTemplates = templates.filter((template) => {
    if (selectedCategory && template.category !== selectedCategory) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        template.name.toLowerCase().includes(query) ||
        template.description?.toLowerCase().includes(query) ||
        template.messageBody.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Replace variables in preview
  const getPreviewText = (template: SMSTemplate): string => {
    let text = template.messageBody;

    if (patientData) {
      text = text
        .replace(/{firstName}/g, patientData.firstName || '[First Name]')
        .replace(/{lastName}/g, patientData.lastName || '[Last Name]')
        .replace(/{patientName}/g, `${patientData.firstName || '[First'} ${patientData.lastName || 'Name]'}`)
        .replace(/{providerName}/g, patientData.providerName || '[Provider]')
        .replace(/{appointmentDate}/g, patientData.appointmentDate || '[Date]')
        .replace(/{appointmentTime}/g, patientData.appointmentTime || '[Time]')
        .replace(/{clinicPhone}/g, patientData.clinicPhone || '[Clinic Phone]')
        .replace(/{clinicName}/g, patientData.clinicName || '[Clinic Name]');
    }

    return text;
  };

  const handleSelectTemplate = () => {
    if (selectedTemplate) {
      onSelect(getPreviewText(selectedTemplate), selectedTemplate.id);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
    }}>
      {/* Backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div style={{
        position: 'relative',
        background: 'white',
        borderRadius: '0.75rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        width: '100%',
        maxWidth: '48rem',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
        }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
            Message Templates
          </h2>
          <button
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '2rem',
              height: '2rem',
              background: '#f3f4f6',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              color: '#6b7280',
            }}
          >
            <svg style={{ width: '1.25rem', height: '1.25rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ position: 'relative' }}>
            <svg
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '1rem',
                height: '1rem',
                color: '#9ca3af',
              }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                border: '1px solid #e5e7eb',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Content */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Categories sidebar */}
          <div style={{
            width: '12rem',
            borderRight: '1px solid #e5e7eb',
            overflowY: 'auto',
            background: '#f9fafb',
          }}>
            <button
              onClick={() => setSelectedCategory(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.625rem 1rem',
                background: selectedCategory === null ? '#ede9fe' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '0.875rem',
                color: selectedCategory === null ? '#7c3aed' : '#374151',
                fontWeight: selectedCategory === null ? '500' : 'normal',
              }}
            >
              <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              All Templates
            </button>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: '100%',
                  padding: '0.625rem 1rem',
                  background: selectedCategory === category ? '#ede9fe' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.875rem',
                  color: selectedCategory === category ? '#7c3aed' : '#374151',
                  fontWeight: selectedCategory === category ? '500' : 'normal',
                }}
              >
                {categoryIcons[category] || categoryIcons.general}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {categoryLabels[category] || category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ')}
                </span>
              </button>
            ))}
          </div>

          {/* Templates list */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{
                  width: '2rem',
                  height: '2rem',
                  border: '2px solid #e5e7eb',
                  borderTopColor: '#7c3aed',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
              </div>
            ) : error ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                <p>{error}</p>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
                <p>No templates found</p>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {filteredTemplates.map((template) => (
                  <div
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    style={{
                      padding: '0.875rem 1rem',
                      borderBottom: '1px solid #e5e7eb',
                      cursor: 'pointer',
                      background: selectedTemplate?.id === template.id ? '#f5f3ff' : 'white',
                      borderLeft: selectedTemplate?.id === template.id ? '3px solid #7c3aed' : '3px solid transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div>
                        <h3 style={{ fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                          {template.name}
                        </h3>
                        {template.description && (
                          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem' }}>
                            {template.description}
                          </p>
                        )}
                      </div>
                      {template.isSystemTemplate && (
                        <span style={{
                          padding: '0.125rem 0.375rem',
                          background: '#dbeafe',
                          color: '#1e40af',
                          borderRadius: '0.25rem',
                          fontSize: '0.625rem',
                          fontWeight: '500',
                        }}>
                          System
                        </span>
                      )}
                    </div>
                    <p style={{
                      fontSize: '0.8125rem',
                      color: '#4b5563',
                      marginTop: '0.5rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {template.messageBody}
                    </p>
                    {template.variables && template.variables.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.375rem', flexWrap: 'wrap' }}>
                        {template.variables.map((variable) => (
                          <span
                            key={variable}
                            style={{
                              padding: '0.0625rem 0.375rem',
                              background: '#f3f4f6',
                              color: '#6b7280',
                              borderRadius: '0.25rem',
                              fontSize: '0.625rem',
                            }}
                          >
                            {`{${variable}}`}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview panel */}
          {selectedTemplate && (
            <div style={{
              width: '16rem',
              borderLeft: '1px solid #e5e7eb',
              padding: '1rem',
              background: '#f9fafb',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <h3 style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                Preview
              </h3>
              <div style={{
                flex: 1,
                background: 'white',
                borderRadius: '0.5rem',
                padding: '0.75rem',
                border: '1px solid #e5e7eb',
              }}>
                <p style={{
                  fontSize: '0.875rem',
                  color: '#111827',
                  lineHeight: '1.5',
                  whiteSpace: 'pre-wrap',
                }}>
                  {getPreviewText(selectedTemplate)}
                </p>
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                <p>{getPreviewText(selectedTemplate).length} characters</p>
                <p>{Math.ceil(getPreviewText(selectedTemplate).length / 160)} SMS segment(s)</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '0.75rem',
          padding: '0.75rem 1.5rem',
          borderTop: '1px solid #e5e7eb',
          background: '#f9fafb',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              color: '#374151',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSelectTemplate}
            disabled={!selectedTemplate}
            style={{
              padding: '0.5rem 1rem',
              background: selectedTemplate ? '#7c3aed' : '#e5e7eb',
              color: selectedTemplate ? 'white' : '#9ca3af',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: selectedTemplate ? 'pointer' : 'not-allowed',
              fontSize: '0.875rem',
              fontWeight: '500',
            }}
          >
            Use Template
          </button>
        </div>
      </div>
    </div>
  );
};

export default SMSTemplateSelector;
