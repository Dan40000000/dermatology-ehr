/**
 * ExtractedFieldsForm Component
 *
 * Displays extracted insurance data from OCR for review and editing
 * Allows user to correct OCR errors before confirming
 */

import React, { useState, useEffect } from 'react';
import {
  Check,
  AlertCircle,
  X,
  Phone,
  CreditCard,
  User,
  Calendar,
  Building,
  Loader2,
} from 'lucide-react';

interface ExtractedFieldsFormProps {
  scanId: string;
  patientId: string;
  extractedData: ExtractedData;
  confidence: number;
  onConfirm: (confirmedData: ExtractedData) => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

interface ExtractedData {
  memberId?: string;
  groupNumber?: string;
  payerName?: string;
  planType?: string;
  planName?: string;
  subscriberName?: string;
  subscriberDob?: string;
  effectiveDate?: string;
  terminationDate?: string;
  copayPcp?: number;
  copaySpecialist?: number;
  copayEr?: number;
  copayUrgentCare?: number;
  claimsPhone?: string;
  priorAuthPhone?: string;
  memberServicesPhone?: string;
  rxBin?: string;
  rxPcn?: string;
  rxGroup?: string;
}

interface FieldConfig {
  key: keyof ExtractedData;
  label: string;
  icon: React.ReactNode;
  type: 'text' | 'date' | 'number' | 'phone' | 'select';
  options?: string[];
  placeholder?: string;
  section: 'primary' | 'subscriber' | 'copays' | 'phone' | 'pharmacy';
}

const PLAN_TYPES = ['PPO', 'HMO', 'EPO', 'POS', 'HDHP', 'Medicare', 'Medicaid', 'Other'];

const FIELD_CONFIG: FieldConfig[] = [
  // Primary Insurance Info
  { key: 'payerName', label: 'Insurance Company', icon: <Building className="w-4 h-4" />, type: 'text', placeholder: 'e.g., Blue Cross Blue Shield', section: 'primary' },
  { key: 'memberId', label: 'Member ID', icon: <CreditCard className="w-4 h-4" />, type: 'text', placeholder: 'e.g., XYZ123456789', section: 'primary' },
  { key: 'groupNumber', label: 'Group Number', icon: <CreditCard className="w-4 h-4" />, type: 'text', placeholder: 'e.g., 98765', section: 'primary' },
  { key: 'planType', label: 'Plan Type', icon: <CreditCard className="w-4 h-4" />, type: 'select', options: PLAN_TYPES, section: 'primary' },
  { key: 'planName', label: 'Plan Name', icon: <CreditCard className="w-4 h-4" />, type: 'text', placeholder: 'e.g., Gold PPO', section: 'primary' },
  { key: 'effectiveDate', label: 'Effective Date', icon: <Calendar className="w-4 h-4" />, type: 'date', section: 'primary' },
  { key: 'terminationDate', label: 'Termination Date', icon: <Calendar className="w-4 h-4" />, type: 'date', section: 'primary' },

  // Subscriber Info
  { key: 'subscriberName', label: 'Subscriber Name', icon: <User className="w-4 h-4" />, type: 'text', placeholder: 'e.g., John Doe', section: 'subscriber' },
  { key: 'subscriberDob', label: 'Subscriber DOB', icon: <Calendar className="w-4 h-4" />, type: 'date', section: 'subscriber' },

  // Copays
  { key: 'copayPcp', label: 'PCP Copay', icon: <CreditCard className="w-4 h-4" />, type: 'number', placeholder: '25', section: 'copays' },
  { key: 'copaySpecialist', label: 'Specialist Copay', icon: <CreditCard className="w-4 h-4" />, type: 'number', placeholder: '50', section: 'copays' },
  { key: 'copayEr', label: 'ER Copay', icon: <CreditCard className="w-4 h-4" />, type: 'number', placeholder: '150', section: 'copays' },
  { key: 'copayUrgentCare', label: 'Urgent Care Copay', icon: <CreditCard className="w-4 h-4" />, type: 'number', placeholder: '50', section: 'copays' },

  // Phone Numbers
  { key: 'claimsPhone', label: 'Claims Phone', icon: <Phone className="w-4 h-4" />, type: 'phone', placeholder: '(800) 555-0100', section: 'phone' },
  { key: 'priorAuthPhone', label: 'Prior Auth Phone', icon: <Phone className="w-4 h-4" />, type: 'phone', placeholder: '(800) 555-0200', section: 'phone' },
  { key: 'memberServicesPhone', label: 'Member Services', icon: <Phone className="w-4 h-4" />, type: 'phone', placeholder: '(800) 555-0300', section: 'phone' },

  // Pharmacy Benefits
  { key: 'rxBin', label: 'RxBIN', icon: <CreditCard className="w-4 h-4" />, type: 'text', placeholder: '003858', section: 'pharmacy' },
  { key: 'rxPcn', label: 'RxPCN', icon: <CreditCard className="w-4 h-4" />, type: 'text', placeholder: 'ADV', section: 'pharmacy' },
  { key: 'rxGroup', label: 'Rx Group', icon: <CreditCard className="w-4 h-4" />, type: 'text', placeholder: 'RX1234', section: 'pharmacy' },
];

const SECTIONS = [
  { id: 'primary', title: 'Insurance Information', description: 'Basic insurance plan details' },
  { id: 'subscriber', title: 'Subscriber Information', description: 'Primary policy holder' },
  { id: 'copays', title: 'Copay Amounts', description: 'Patient responsibility per visit type' },
  { id: 'phone', title: 'Phone Numbers', description: 'Contact numbers for the insurance' },
  { id: 'pharmacy', title: 'Pharmacy Benefits', description: 'Prescription coverage details' },
];

export const ExtractedFieldsForm: React.FC<ExtractedFieldsFormProps> = ({
  scanId,
  patientId,
  extractedData: initialData,
  confidence,
  onConfirm,
  onCancel,
  isSubmitting = false,
}) => {
  const [formData, setFormData] = useState<ExtractedData>(initialData);
  const [errors, setErrors] = useState<Partial<Record<keyof ExtractedData, string>>>({});

  useEffect(() => {
    setFormData(initialData);
  }, [initialData]);

  const handleChange = (key: keyof ExtractedData, value: string | number | undefined) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: undefined }));
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof ExtractedData, string>> = {};

    // Member ID is required
    if (!formData.memberId?.trim()) {
      newErrors.memberId = 'Member ID is required';
    }

    // Payer name is required
    if (!formData.payerName?.trim()) {
      newErrors.payerName = 'Insurance company is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      onConfirm(formData);
    }
  };

  const getConfidenceColor = () => {
    if (confidence >= 80) return 'text-green-600 bg-green-50';
    if (confidence >= 60) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getConfidenceLabel = () => {
    if (confidence >= 80) return 'High Confidence';
    if (confidence >= 60) return 'Medium Confidence';
    return 'Low Confidence - Please verify';
  };

  const renderField = (config: FieldConfig) => {
    const value = formData[config.key];
    const error = errors[config.key];

    return (
      <div key={config.key} className="relative">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          <span className="flex items-center space-x-2">
            {config.icon}
            <span>{config.label}</span>
          </span>
        </label>

        {config.type === 'select' ? (
          <select
            value={(value as string) || ''}
            onChange={(e) => handleChange(config.key, e.target.value || undefined)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              error ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            <option value="">Select {config.label}</option>
            {config.options?.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        ) : config.type === 'number' ? (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
            <input
              type="number"
              value={value !== undefined ? value : ''}
              onChange={(e) => handleChange(config.key, e.target.value ? parseInt(e.target.value, 10) : undefined)}
              placeholder={config.placeholder}
              className={`w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                error ? 'border-red-500' : 'border-gray-300'
              }`}
            />
          </div>
        ) : (
          <input
            type={config.type === 'date' ? 'date' : 'text'}
            value={(value as string) || ''}
            onChange={(e) => handleChange(config.key, e.target.value || undefined)}
            placeholder={config.placeholder}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              error ? 'border-red-500' : 'border-gray-300'
            }`}
          />
        )}

        {error && (
          <p className="mt-1 text-sm text-red-600 flex items-center">
            <AlertCircle className="w-4 h-4 mr-1" />
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Review Extracted Data</h2>
            <p className="text-sm text-gray-600 mt-1">
              Please review and correct any errors before saving
            </p>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${getConfidenceColor()}`}>
            {Math.round(confidence)}% - {getConfidenceLabel()}
          </div>
        </div>
      </div>

      {/* Form Sections */}
      <div className="p-6 space-y-8">
        {SECTIONS.map(section => {
          const sectionFields = FIELD_CONFIG.filter(f => f.section === section.id);

          if (sectionFields.length === 0) return null;

          return (
            <div key={section.id}>
              <div className="mb-4">
                <h3 className="text-lg font-medium text-gray-900">{section.title}</h3>
                <p className="text-sm text-gray-500">{section.description}</p>
              </div>
              <div className={`grid gap-4 ${
                section.id === 'copays' ? 'grid-cols-4' :
                section.id === 'phone' || section.id === 'pharmacy' ? 'grid-cols-3' :
                'grid-cols-2'
              }`}>
                {sectionFields.map(renderField)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center rounded-b-lg">
        <div className="text-sm text-gray-500">
          Fields marked with * are required
        </div>
        <div className="flex space-x-3">
          {onCancel && (
            <button
              onClick={onCancel}
              disabled={isSubmitting}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center space-x-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Confirm & Save</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
