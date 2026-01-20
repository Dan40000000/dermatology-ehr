import React, { useState, useEffect } from 'react';
import {
  X,
  TestTube,
  Camera,
  Clock,
  Edit2,
  Trash2,
  ChevronRight,
  AlertCircle,
  FileText,
  Image as ImageIcon
} from 'lucide-react';
import { LesionMarker } from './BodyMapMarker';
import { LesionTimeline } from './LesionTimeline';
import { BiopsyFromLesion } from './BiopsyFromLesion';
import { PhotoFromLesion } from './PhotoFromLesion';
import { LesionPhotoComparison } from './LesionPhotoComparison';

export interface EnhancedLesionDetailModalProps {
  lesion: LesionMarker;
  onClose: () => void;
  onUpdate: (lesionId: string, updates: Partial<LesionMarker>) => Promise<void>;
  onDelete: (lesionId: string) => Promise<void>;
}

type TabType = 'info' | 'biopsies' | 'photos' | 'comparison' | 'timeline';

interface Biopsy {
  id: string;
  specimen_id: string;
  specimen_type: string;
  status: string;
  ordered_at: string;
  resulted_at?: string;
  pathology_diagnosis?: string;
  malignancy_type?: string;
  ordering_provider_name?: string;
  reviewing_provider_name?: string;
}

interface Photo {
  id: string;
  url?: string;
  file_path?: string;
  thumbnail_path?: string;
  created_at: string;
  photo_type: string;
  notes?: string;
}

export function EnhancedLesionDetailModal({
  lesion,
  onClose,
  onUpdate,
  onDelete
}: EnhancedLesionDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('info');
  const [isEditing, setIsEditing] = useState(false);
  const [editedLesion, setEditedLesion] = useState<Partial<LesionMarker>>(lesion);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBiopsyForm, setShowBiopsyForm] = useState(false);
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);

  const [biopsies, setBiopsies] = useState<Biopsy[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoadingBiopsies, setIsLoadingBiopsies] = useState(false);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);

  useEffect(() => {
    if (activeTab === 'biopsies') {
      fetchBiopsies();
    } else if (activeTab === 'photos' || activeTab === 'comparison') {
      fetchPhotos();
    }
  }, [activeTab, lesion.id]);

  const fetchBiopsies = async () => {
    setIsLoadingBiopsies(true);
    try {
      const response = await fetch(`/api/lesions/${lesion.id}/biopsies`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setBiopsies(data.biopsies || []);
      }
    } catch (error) {
      console.error('Error fetching biopsies:', error);
    } finally {
      setIsLoadingBiopsies(false);
    }
  };

  const fetchPhotos = async () => {
    setIsLoadingPhotos(true);
    try {
      const response = await fetch(`/api/lesions/${lesion.id}/photos`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setPhotos(data.photos || []);
      }
    } catch (error) {
      console.error('Error fetching photos:', error);
    } finally {
      setIsLoadingPhotos(false);
    }
  };

  const handleSave = async () => {
    try {
      await onUpdate(lesion.id, editedLesion);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update lesion:', error);
    }
  };

  const handleDelete = async () => {
    try {
      await onDelete(lesion.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete lesion:', error);
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'Not recorded';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const statusColor = {
    monitoring: '#3B82F6',
    suspicious: '#EAB308',
    benign: '#10B981',
    malignant: '#EF4444',
    treated: '#8B5CF6',
    resolved: '#6B7280',
  }[lesion.status] || '#6B7280';

  const tabs: { id: TabType; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'info', label: 'Details', icon: <FileText className="w-4 h-4" /> },
    { id: 'biopsies', label: 'Biopsies', icon: <TestTube className="w-4 h-4" />, count: biopsies.length },
    { id: 'photos', label: 'Photos', icon: <Camera className="w-4 h-4" />, count: photos.length },
    { id: 'comparison', label: 'Compare', icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'timeline', label: 'Timeline', icon: <Clock className="w-4 h-4" /> },
  ];

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-purple-50 to-blue-50">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-gray-900">Lesion Details</h2>
              <div
                className="px-3 py-1 rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: statusColor }}
              >
                {lesion.status?.toUpperCase()}
              </div>
            </div>
            <div className="text-sm text-gray-600 mt-1">
              {lesion.anatomical_location || lesion.body_location || 'Unknown location'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b bg-gray-50 px-6">
          <div className="flex gap-1 -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium rounded-t-lg transition-all flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'bg-white text-purple-600 border-b-2 border-purple-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="ml-1 px-2 py-0.5 bg-purple-100 text-purple-600 text-xs rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'info' && (
            <div className="space-y-6">
              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setActiveTab('biopsies');
                    setShowBiopsyForm(true);
                  }}
                  className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-yellow-500 hover:bg-yellow-50 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-yellow-100 rounded-lg group-hover:bg-yellow-200">
                      <TestTube className="w-5 h-5 text-yellow-700" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-gray-900">Order Biopsy</div>
                      <div className="text-xs text-gray-500">Send for pathology</div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 ml-auto" />
                  </div>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('photos');
                    setShowPhotoCapture(true);
                  }}
                  className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg group-hover:bg-purple-200">
                      <Camera className="w-5 h-5 text-purple-700" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-gray-900">Take Photo</div>
                      <div className="text-xs text-gray-500">Document progression</div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 ml-auto" />
                  </div>
                </button>
              </div>

              {/* Lesion Information */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedLesion.anatomical_location || ''}
                      onChange={(e) =>
                        setEditedLesion({ ...editedLesion, anatomical_location: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  ) : (
                    <div className="text-gray-900">{lesion.anatomical_location || 'Not specified'}</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  {isEditing ? (
                    <select
                      value={editedLesion.lesion_type || ''}
                      onChange={(e) => setEditedLesion({ ...editedLesion, lesion_type: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">Select type</option>
                      <option value="nevus">Nevus (Mole)</option>
                      <option value="cyst">Cyst</option>
                      <option value="papule">Papule</option>
                      <option value="plaque">Plaque</option>
                      <option value="nodule">Nodule</option>
                      <option value="melanoma">Melanoma</option>
                      <option value="bcc">Basal Cell Carcinoma</option>
                      <option value="scc">Squamous Cell Carcinoma</option>
                    </select>
                  ) : (
                    <div className="text-gray-900">{lesion.lesion_type || 'Not specified'}</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Size (mm)</label>
                  {isEditing ? (
                    <input
                      type="number"
                      step="0.1"
                      value={editedLesion.size_mm || ''}
                      onChange={(e) =>
                        setEditedLesion({ ...editedLesion, size_mm: parseFloat(e.target.value) })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  ) : (
                    <div className="text-gray-900">{lesion.size_mm ? `${lesion.size_mm} mm` : 'Not measured'}</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedLesion.color || ''}
                      onChange={(e) => setEditedLesion({ ...editedLesion, color: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  ) : (
                    <div className="text-gray-900">{lesion.color || 'Not specified'}</div>
                  )}
                </div>
              </div>

              {/* Clinical Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clinical Notes</label>
                {isEditing ? (
                  <textarea
                    value={editedLesion.notes || ''}
                    onChange={(e) => setEditedLesion({ ...editedLesion, notes: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                ) : (
                  <div className="text-gray-900 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">
                    {lesion.notes || 'No notes'}
                  </div>
                )}
              </div>

              {/* Pathology Result (if available) */}
              {lesion.pathology_result && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-blue-900 mb-1">Pathology Result</div>
                      <div className="text-sm text-blue-800">{lesion.pathology_result}</div>
                      {lesion.biopsy_date && (
                        <div className="text-xs text-blue-600 mt-1">
                          Date: {formatDate(lesion.biopsy_date)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <div className="text-sm font-medium text-gray-700">First Noted</div>
                  <div className="text-gray-600 text-sm">{formatDate(lesion.first_noted_date)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-700">Last Examined</div>
                  <div className="text-gray-600 text-sm">{formatDate(lesion.last_examined_date)}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'biopsies' && (
            <div>
              {showBiopsyForm ? (
                <BiopsyFromLesion
                  lesionId={lesion.id}
                  patientId={lesion.patient_id}
                  lesionLocation={lesion.anatomical_location || lesion.body_location || ''}
                  lesionDescription={lesion.notes}
                  onSuccess={() => {
                    setShowBiopsyForm(false);
                    fetchBiopsies();
                  }}
                  onCancel={() => setShowBiopsyForm(false)}
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Biopsies</h3>
                    <button
                      onClick={() => setShowBiopsyForm(true)}
                      className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors flex items-center gap-2"
                    >
                      <TestTube className="w-4 h-4" />
                      Order New Biopsy
                    </button>
                  </div>

                  {isLoadingBiopsies ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                    </div>
                  ) : biopsies.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <TestTube className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                      <p>No biopsies ordered yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {biopsies.map((biopsy) => (
                        <div
                          key={biopsy.id}
                          className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-mono font-semibold text-gray-900">
                                {biopsy.specimen_id}
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                {biopsy.specimen_type} • {formatDate(biopsy.ordered_at)}
                              </div>
                              {biopsy.pathology_diagnosis && (
                                <div className="mt-2 text-sm">
                                  <span className="font-medium">Diagnosis:</span> {biopsy.pathology_diagnosis}
                                </div>
                              )}
                            </div>
                            <div
                              className={`px-3 py-1 rounded-full text-xs font-medium ${
                                biopsy.status === 'resulted'
                                  ? 'bg-green-100 text-green-700'
                                  : biopsy.status === 'sent'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {biopsy.status}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'photos' && (
            <div>
              {showPhotoCapture ? (
                <PhotoFromLesion
                  lesionId={lesion.id}
                  patientId={lesion.patient_id}
                  lesionLocation={lesion.anatomical_location || lesion.body_location || ''}
                  onSuccess={() => {
                    setShowPhotoCapture(false);
                    fetchPhotos();
                  }}
                  onCancel={() => setShowPhotoCapture(false)}
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Photos</h3>
                    <button
                      onClick={() => setShowPhotoCapture(true)}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      Add Photo
                    </button>
                  </div>

                  {isLoadingPhotos ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                    </div>
                  ) : photos.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Camera className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                      <p>No photos yet</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-4">
                      {photos.map((photo) => (
                        <div key={photo.id} className="space-y-2">
                          <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                            <img
                              src={photo.thumbnail_path || photo.url || photo.file_path}
                              alt="Lesion"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="text-xs text-gray-600">{formatDate(photo.created_at)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'comparison' && (
            <LesionPhotoComparison lesionId={lesion.id} patientId={lesion.patient_id} />
          )}

          {activeTab === 'timeline' && <LesionTimeline lesionId={lesion.id} patientId={lesion.patient_id} />}
        </div>

        {/* Footer */}
        {activeTab === 'info' && (
          <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
            <div>
              {showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600 font-medium">Delete this lesion?</span>
                  <button
                    onClick={handleDelete}
                    className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Lesion
                </button>
              )}
            </div>

            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditedLesion(lesion);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Save Changes
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit Details
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
