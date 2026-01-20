/**
 * InsuranceCard Component
 *
 * Displays insurance information in a card format
 * Allows uploading front/back insurance card images
 * Supports editing insurance details
 */

import React, { useState } from 'react';
import { CreditCard, Upload, Edit2, Save, X, Plus } from 'lucide-react';
import { api } from '../../api';

interface InsuranceCardProps {
  patientId: string;
  insurance?: InsuranceInfo;
  onUpdate?: (insurance: InsuranceInfo) => void;
}

interface InsuranceInfo {
  id?: string;
  payerId: string;
  payerName: string;
  memberId: string;
  groupNumber?: string;
  planName?: string;
  planType?: string;
  subscriberName?: string;
  subscriberDob?: string;
  relationship?: string;
  effectiveDate?: string;
  terminationDate?: string;
  frontImageUrl?: string;
  backImageUrl?: string;
  isPrimary?: boolean;
}

export const InsuranceCard: React.FC<InsuranceCardProps> = ({
  patientId,
  insurance: initialInsurance,
  onUpdate,
}) => {
  const [insurance, setInsurance] = useState<InsuranceInfo | undefined>(initialInsurance);
  const [isEditing, setIsEditing] = useState(!initialInsurance);
  const [isSaving, setIsSaving] = useState(false);
  const [frontImagePreview, setFrontImagePreview] = useState<string | null>(
    initialInsurance?.frontImageUrl || null
  );
  const [backImagePreview, setBackImagePreview] = useState<string | null>(
    initialInsurance?.backImageUrl || null
  );

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    side: 'front' | 'back'
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Preview the image
    const reader = new FileReader();
    reader.onloadend = () => {
      if (side === 'front') {
        setFrontImagePreview(reader.result as string);
      } else {
        setBackImagePreview(reader.result as string);
      }
    };
    reader.readAsDataURL(file);

    // Upload to server
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('patientId', patientId);
      formData.append('documentType', `insurance_card_${side}`);

      const response = await api.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        const imageUrl = response.data.fileUrl;
        setInsurance(prev => ({
          ...prev!,
          [side === 'front' ? 'frontImageUrl' : 'backImageUrl']: imageUrl,
        }));
      }
    } catch (error) {
      console.error('Error uploading insurance card image:', error);
      alert('Failed to upload image. Please try again.');
    }
  };

  const handleSave = async () => {
    if (!insurance) return;

    setIsSaving(true);

    try {
      // Save insurance information
      const response = await api.put(`/api/patients/${patientId}/insurance`, insurance);

      if (response.data.success) {
        setIsEditing(false);
        onUpdate?.(insurance);
      }
    } catch (error) {
      console.error('Error saving insurance:', error);
      alert('Failed to save insurance information. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setInsurance(initialInsurance);
    setFrontImagePreview(initialInsurance?.frontImageUrl || null);
    setBackImagePreview(initialInsurance?.backImageUrl || null);
    setIsEditing(false);
  };

  if (!insurance && !isEditing) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200 p-8">
        <div className="text-center">
          <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">No insurance information on file</p>
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors mx-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Insurance</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CreditCard className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              {insurance?.isPrimary ? 'Primary' : 'Secondary'} Insurance
            </h2>
          </div>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center space-x-2 text-blue-600 hover:text-blue-700"
            >
              <Edit2 className="w-4 h-4" />
              <span>Edit</span>
            </button>
          ) : (
            <div className="flex space-x-2">
              <button
                onClick={handleCancel}
                className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Insurance Details */}
      <div className="p-6 space-y-6">
        {/* Card Images */}
        <div className="grid grid-cols-2 gap-4">
          {/* Front of Card */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Front of Card
            </label>
            {frontImagePreview ? (
              <div className="relative">
                <img
                  src={frontImagePreview}
                  alt="Front of insurance card"
                  className="w-full h-48 object-cover rounded-lg border border-gray-300"
                />
                {isEditing && (
                  <label className="absolute bottom-2 right-2 bg-white px-3 py-2 rounded-lg shadow-lg cursor-pointer hover:bg-gray-50">
                    <Upload className="w-4 h-4 text-gray-600" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, 'front')}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50">
                <Upload className="w-8 h-8 text-gray-400 mb-2" />
                <span className="text-sm text-gray-600">Upload Front</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'front')}
                  className="hidden"
                  disabled={!isEditing}
                />
              </label>
            )}
          </div>

          {/* Back of Card */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Back of Card
            </label>
            {backImagePreview ? (
              <div className="relative">
                <img
                  src={backImagePreview}
                  alt="Back of insurance card"
                  className="w-full h-48 object-cover rounded-lg border border-gray-300"
                />
                {isEditing && (
                  <label className="absolute bottom-2 right-2 bg-white px-3 py-2 rounded-lg shadow-lg cursor-pointer hover:bg-gray-50">
                    <Upload className="w-4 h-4 text-gray-600" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, 'back')}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50">
                <Upload className="w-8 h-8 text-gray-400 mb-2" />
                <span className="text-sm text-gray-600">Upload Back</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'back')}
                  className="hidden"
                  disabled={!isEditing}
                />
              </label>
            )}
          </div>
        </div>

        {/* Insurance Information Form */}
        <div className="grid grid-cols-2 gap-4">
          {/* Payer Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Insurance Company
            </label>
            {isEditing ? (
              <input
                type="text"
                value={insurance?.payerName || ''}
                onChange={(e) => setInsurance(prev => ({ ...prev!, payerName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Blue Cross Blue Shield"
              />
            ) : (
              <p className="text-gray-900">{insurance?.payerName || 'N/A'}</p>
            )}
          </div>

          {/* Member ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Member ID
            </label>
            {isEditing ? (
              <input
                type="text"
                value={insurance?.memberId || ''}
                onChange={(e) => setInsurance(prev => ({ ...prev!, memberId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., XYZ123456789"
              />
            ) : (
              <p className="text-gray-900 font-mono">{insurance?.memberId || 'N/A'}</p>
            )}
          </div>

          {/* Group Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Group Number
            </label>
            {isEditing ? (
              <input
                type="text"
                value={insurance?.groupNumber || ''}
                onChange={(e) => setInsurance(prev => ({ ...prev!, groupNumber: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., 98765"
              />
            ) : (
              <p className="text-gray-900 font-mono">{insurance?.groupNumber || 'N/A'}</p>
            )}
          </div>

          {/* Plan Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Plan Name
            </label>
            {isEditing ? (
              <input
                type="text"
                value={insurance?.planName || ''}
                onChange={(e) => setInsurance(prev => ({ ...prev!, planName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., PPO Plan"
              />
            ) : (
              <p className="text-gray-900">{insurance?.planName || 'N/A'}</p>
            )}
          </div>

          {/* Plan Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Plan Type
            </label>
            {isEditing ? (
              <select
                value={insurance?.planType || ''}
                onChange={(e) => setInsurance(prev => ({ ...prev!, planType: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select plan type</option>
                <option value="PPO">PPO</option>
                <option value="HMO">HMO</option>
                <option value="EPO">EPO</option>
                <option value="POS">POS</option>
                <option value="HDHP">High Deductible (HDHP)</option>
              </select>
            ) : (
              <p className="text-gray-900">{insurance?.planType || 'N/A'}</p>
            )}
          </div>

          {/* Relationship */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Relationship to Subscriber
            </label>
            {isEditing ? (
              <select
                value={insurance?.relationship || 'self'}
                onChange={(e) => setInsurance(prev => ({ ...prev!, relationship: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="self">Self</option>
                <option value="spouse">Spouse</option>
                <option value="child">Child</option>
                <option value="other">Other</option>
              </select>
            ) : (
              <p className="text-gray-900 capitalize">{insurance?.relationship || 'Self'}</p>
            )}
          </div>

          {/* Effective Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Effective Date
            </label>
            {isEditing ? (
              <input
                type="date"
                value={insurance?.effectiveDate || ''}
                onChange={(e) => setInsurance(prev => ({ ...prev!, effectiveDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            ) : (
              <p className="text-gray-900">
                {insurance?.effectiveDate ? new Date(insurance.effectiveDate).toLocaleDateString() : 'N/A'}
              </p>
            )}
          </div>

          {/* Termination Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Termination Date
            </label>
            {isEditing ? (
              <input
                type="date"
                value={insurance?.terminationDate || ''}
                onChange={(e) => setInsurance(prev => ({ ...prev!, terminationDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            ) : (
              <p className="text-gray-900">
                {insurance?.terminationDate ? new Date(insurance.terminationDate).toLocaleDateString() : 'N/A'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
