import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton, Modal } from '../components/ui';
import {
  fetchDocuments,
  fetchPatients,
  createDocument,
  uploadDocumentFile,
  fetchPracticeConsentForms,
  createPracticeConsentForm,
  updatePracticeConsentForm,
  deactivatePracticeConsentForm,
  API_BASE_URL,
} from '../api';
import type { Document, Patient } from '../types';
import type { PracticeConsentFormRecord } from '../api';

type ViewMode = 'grid' | 'list';
type DocCategory = 'all' | 'lab-result' | 'imaging' | 'referral' | 'consent' | 'other';

const DOC_CATEGORIES: { value: DocCategory; label: string; icon: string }[] = [
  { value: 'lab-result', label: 'Lab Results', icon: '' },
  { value: 'imaging', label: 'Imaging', icon: '' },
  { value: 'referral', label: 'Referrals', icon: '' },
  { value: 'consent', label: 'Consent Forms', icon: '' },
  { value: 'other', label: 'Other', icon: '' },
];

const DOC_CATEGORY_TO_API: Record<Exclude<DocCategory, 'all'>, string> = {
  'lab-result': 'Lab Results',
  imaging: 'Imaging',
  referral: 'Referrals',
  consent: 'Consent Forms',
  other: 'Other',
};

function toDocCategory(value?: string): Exclude<DocCategory, 'all'> {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'lab results' || normalized === 'lab-result' || normalized === 'lab_result') {
    return 'lab-result';
  }
  if (normalized === 'imaging') {
    return 'imaging';
  }
  if (normalized === 'referrals' || normalized === 'referral') {
    return 'referral';
  }
  if (
    normalized === 'consent forms' ||
    normalized === 'consent form' ||
    normalized === 'consent'
  ) {
    return 'consent';
  }
  return 'other';
}

type DocumentPreviewKind = 'none' | 'image' | 'pdf';

const createInitialUploadForm = () => ({
  patientId: '',
  category: 'other' as DocCategory,
  title: '',
  description: '',
  file: null as File | null,
  previewUrl: '',
});

type ConsentEditorForm = {
  formName: string;
  formType: string;
  formContent: string;
  requiresSignature: boolean;
  isActive: boolean;
  version: string;
  effectiveDate: string;
};

const COMMON_CONSENT_TYPES = [
  { value: 'general-consent', label: 'General Treatment' },
  { value: 'hipaa', label: 'HIPAA Acknowledgment' },
  { value: 'procedure-consent', label: 'Procedure Specific' },
  { value: 'cosmetic-consent', label: 'Cosmetic / Self-Pay' },
  { value: 'financial', label: 'Financial Policy' },
];

function normalizeDateInputValue(value?: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function createInitialConsentDraft(): ConsentEditorForm {
  return {
    formName: '',
    formType: 'general-consent',
    formContent: '',
    requiresSignature: true,
    isActive: true,
    version: '1.0',
    effectiveDate: new Date().toISOString().slice(0, 10),
  };
}

function mapConsentFormToDraft(form: PracticeConsentFormRecord): ConsentEditorForm {
  return {
    formName: form.formName,
    formType: form.formType,
    formContent: form.formContent,
    requiresSignature: form.requiresSignature,
    isActive: form.isActive,
    version: form.version || '1.0',
    effectiveDate: normalizeDateInputValue(form.effectiveDate) || new Date().toISOString().slice(0, 10),
  };
}

function getConsentTypeLabel(formType: string): string {
  const match = COMMON_CONSENT_TYPES.find((option) => option.value === formType);
  if (match) {
    return match.label;
  }

  return formType
    .split(/[-_]/g)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

export function DocumentsPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [categoryFilter, setCategoryFilter] = useState<DocCategory>('all');
  const [selectedPatient, setSelectedPatient] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [recentFilter, setRecentFilter] = useState(false);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isUploadDragOver, setIsUploadDragOver] = useState(false);

  const [uploadForm, setUploadForm] = useState(createInitialUploadForm);
  const [consentFormsLoading, setConsentFormsLoading] = useState(true);
  const [consentForms, setConsentForms] = useState<PracticeConsentFormRecord[]>([]);
  const [selectedConsentId, setSelectedConsentId] = useState<string | null>(null);
  const [consentDraft, setConsentDraft] = useState<ConsentEditorForm>(createInitialConsentDraft);
  const [consentSavePending, setConsentSavePending] = useState(false);
  const [consentWorkspaceError, setConsentWorkspaceError] = useState('');
  const selectedConsentIdRef = useRef<string | null>(null);

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const [docsRes, patientsRes] = await Promise.all([
        fetchDocuments(session.tenantId, session.accessToken),
        fetchPatients(session.tenantId, session.accessToken),
      ]);

      setDocuments(docsRes.documents || []);
      setPatients(patientsRes.patients || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    selectedConsentIdRef.current = selectedConsentId;
  }, [selectedConsentId]);

  const loadConsentWorkspace = useCallback(async (preferredConsentId?: string | null) => {
    if (!session) return;

    setConsentFormsLoading(true);
    setConsentWorkspaceError('');

    try {
      const response = await fetchPracticeConsentForms(session.tenantId, session.accessToken);
      const forms = response.forms || [];

      setConsentForms(forms);

      const preferredId =
        preferredConsentId === undefined ? selectedConsentIdRef.current : preferredConsentId;
      const nextSelection =
        forms.find((form) => form.id === preferredId)
        || forms.find((form) => form.isActive)
        || forms[0]
        || null;

      setSelectedConsentId(nextSelection?.id ?? null);
      setConsentDraft(nextSelection ? mapConsentFormToDraft(nextSelection) : createInitialConsentDraft());
    } catch (err: any) {
      const message = err.message || 'Failed to load consent forms';
      setConsentForms([]);
      setSelectedConsentId(null);
      setConsentDraft(createInitialConsentDraft());
      setConsentWorkspaceError(message);
      showError(message);
    } finally {
      setConsentFormsLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle query parameters on page load
  useEffect(() => {
    const action = searchParams.get('action');
    const filter = searchParams.get('filter');
    const section = searchParams.get('section');
    const category = searchParams.get('category');

    // Handle action=upload
    if (action === 'upload') {
      setShowUploadModal(true);
    }

    // Handle filter=recent
    if (filter === 'recent') {
      setRecentFilter(true);
    } else {
      setRecentFilter(false);
    }

    // Forms workspace merged into Documents
    if (section === 'forms') {
      setCategoryFilter('consent');
      setRecentFilter(false);
    } else if (
      category &&
      ['all', 'lab-result', 'imaging', 'referral', 'consent', 'other'].includes(category)
    ) {
      setCategoryFilter(category as DocCategory);
    }
  }, [searchParams]);

  useEffect(
    () => () => {
      if (uploadForm.previewUrl) {
        URL.revokeObjectURL(uploadForm.previewUrl);
      }
    },
    [uploadForm.previewUrl]
  );

  const clearUploadActionParam = () => {
    if (searchParams.get('action') !== 'upload') {
      return;
    }
    const params = new URLSearchParams(searchParams);
    params.delete('action');
    setSearchParams(params);
  };

  const resetUploadForm = () => {
    setUploadForm((prev) => {
      if (prev.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return createInitialUploadForm();
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
    setIsUploadDragOver(false);
  };

  const clearSelectedFile = () => {
    setUploadForm((prev) => {
      if (prev.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return { ...prev, file: null, previewUrl: '' };
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
    setIsUploadDragOver(false);
  };

  const applySelectedFile = (file: File) => {
    const canPreview = file.type.startsWith('image/') || file.type === 'application/pdf';
    const previewUrl = canPreview ? URL.createObjectURL(file) : '';
    setUploadForm((prev) => {
      if (prev.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return {
        ...prev,
        file,
        previewUrl,
        title: prev.title || file.name.replace(/\.[^/.]+$/, ''),
      };
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      applySelectedFile(file);
    }
  };

  const handleUploadDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsUploadDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      applySelectedFile(file);
    }
  };

  const getPreviewKind = (file: File | null): DocumentPreviewKind => {
    if (!file) {
      return 'none';
    }
    if (file.type.startsWith('image/')) {
      return 'image';
    }
    if (file.type === 'application/pdf') {
      return 'pdf';
    }
    return 'none';
  };

  const openUploadModal = () => {
    setShowUploadModal(true);
    const params = new URLSearchParams(searchParams);
    params.set('action', 'upload');
    setSearchParams(params);
  };

  const handleUpload = async () => {
    if (!session || !uploadForm.file || !uploadForm.patientId) {
      showError('Please select a patient and file');
      return;
    }

    setUploading(true);
    try {
      // Upload file first
      const uploadResult = await uploadDocumentFile(
        session.tenantId,
        session.accessToken,
        uploadForm.file
      );

      // Create document record
      await createDocument(session.tenantId, session.accessToken, {
        patientId: uploadForm.patientId,
        url: uploadResult.url,
        objectKey: uploadResult.objectKey,
        storage: uploadResult.storage,
        category: DOC_CATEGORY_TO_API[uploadForm.category],
        title: uploadForm.title || uploadForm.file.name,
        description: uploadForm.description,
        filename: uploadForm.file.name,
        mimeType: uploadForm.file.type,
        fileSize: uploadForm.file.size,
      });

      showSuccess('Document uploaded successfully');
      setShowUploadModal(false);
      resetUploadForm();
      // Clear the action parameter from URL
      clearUploadActionParam();
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const getPatientName = (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown';
  };

  const getDocUrl = (doc: Document) => {
    if (doc.storage === 's3' && doc.objectKey) {
      return `${API_BASE_URL}/api/documents/view/${doc.objectKey}`;
    }
    return doc.url;
  };

  const filteredDocuments = documents.filter((doc) => {
    if (categoryFilter !== 'all' && toDocCategory(doc.category) !== categoryFilter) return false;
    if (selectedPatient !== 'all' && doc.patientId !== selectedPatient) return false;

    // Filter for recent documents (last 7 days)
    if (recentFilter) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const docDate = new Date(doc.createdAt);
      if (docDate < sevenDaysAgo) return false;
    }

    if (searchTerm) {
      const patientName = getPatientName(doc.patientId).toLowerCase();
      const title = (doc.title || '').toLowerCase();
      const desc = (doc.description || '').toLowerCase();
      if (
        !patientName.includes(searchTerm.toLowerCase()) &&
        !title.includes(searchTerm.toLowerCase()) &&
        !desc.includes(searchTerm.toLowerCase())
      ) {
        return false;
      }
    }
    return true;
  });

  const getCategoryInfo = (category?: string) => {
    const normalizedCategory = toDocCategory(category);
    const cat = DOC_CATEGORIES.find((c) => c.value === normalizedCategory);
    return cat || { value: 'other', label: 'Other', icon: '' };
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType?: string) => {
    if (!mimeType) return '';
    if (mimeType.startsWith('image/')) return '';
    if (mimeType === 'application/pdf') return '';
    if (mimeType.includes('word')) return '';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '';
    return '';
  };

  const openTemplateLibrary = (instructionType?: string) => {
    const params = new URLSearchParams();
    if (instructionType) {
      params.set('instructionType', instructionType);
    }
    if (selectedPatient !== 'all') {
      params.set('patientId', selectedPatient);
    }
    const query = params.toString();
    navigate(`/handouts${query ? `?${query}` : ''}`);
  };

  const openFormsWorkspace = () => {
    setCategoryFilter('consent');
    setRecentFilter(false);
    const params = new URLSearchParams(searchParams);
    params.set('section', 'forms');
    params.set('category', 'consent');
    params.delete('filter');
    setSearchParams(params);
  };

  const isConsentWorkspaceActive =
    searchParams.get('section') === 'forms' || categoryFilter === 'consent';
  const selectedConsentForm = consentForms.find((form) => form.id === selectedConsentId) || null;
  const canManageConsentForms =
    session?.user.role === 'admin' || session?.user.role === 'provider';

  const handleSelectConsentForm = (form: PracticeConsentFormRecord) => {
    setSelectedConsentId(form.id);
    setConsentDraft(mapConsentFormToDraft(form));
    setConsentWorkspaceError('');
  };

  const handleStartNewConsent = () => {
    setSelectedConsentId(null);
    setConsentDraft(createInitialConsentDraft());
    setConsentWorkspaceError('');
  };

  const handleResetConsentDraft = () => {
    setConsentDraft(selectedConsentForm ? mapConsentFormToDraft(selectedConsentForm) : createInitialConsentDraft());
    setConsentWorkspaceError('');
  };

  const handleSaveConsent = async () => {
    if (!session || !canManageConsentForms) {
      return;
    }

    if (!consentDraft.formName.trim() || !consentDraft.formType.trim() || !consentDraft.formContent.trim()) {
      setConsentWorkspaceError('Form name, type, and content are required.');
      return;
    }

    setConsentSavePending(true);
    setConsentWorkspaceError('');

    try {
      const payload = {
        formName: consentDraft.formName.trim(),
        formType: consentDraft.formType.trim(),
        formContent: consentDraft.formContent,
        requiresSignature: consentDraft.requiresSignature,
        isActive: consentDraft.isActive,
        version: consentDraft.version.trim() || '1.0',
        effectiveDate: consentDraft.effectiveDate || undefined,
      };

      if (selectedConsentForm) {
        await updatePracticeConsentForm(session.tenantId, session.accessToken, selectedConsentForm.id, payload);
        showSuccess('Consent form updated');
        await loadConsentWorkspace(selectedConsentForm.id);
      } else {
        const created = await createPracticeConsentForm(session.tenantId, session.accessToken, payload);
        showSuccess('Consent form created');
        await loadConsentWorkspace(created.id);
      }
    } catch (err: any) {
      const message = err.message || 'Failed to save consent form';
      setConsentWorkspaceError(message);
      showError(message);
    } finally {
      setConsentSavePending(false);
    }
  };

  const handleDeactivateSelectedConsent = async () => {
    if (!session || !selectedConsentForm) {
      return;
    }

    if (!window.confirm(`Retire "${selectedConsentForm.formName}" from active kiosk use?`)) {
      return;
    }

    setConsentSavePending(true);
    setConsentWorkspaceError('');

    try {
      await deactivatePracticeConsentForm(session.tenantId, session.accessToken, selectedConsentForm.id);
      showSuccess('Consent form retired');
      await loadConsentWorkspace();
    } catch (err: any) {
      const message = err.message || 'Failed to retire consent form';
      setConsentWorkspaceError(message);
      showError(message);
    } finally {
      setConsentSavePending(false);
    }
  };

  useEffect(() => {
    if (!isConsentWorkspaceActive) {
      return;
    }

    loadConsentWorkspace();
  }, [isConsentWorkspaceActive, loadConsentWorkspace]);

  if (loading) {
    return (
      <div className="documents-page">
        <div className="page-header">
          <h1>Documents</h1>
        </div>
        <Skeleton variant="card" height={60} />
        <Skeleton variant="card" height={400} />
      </div>
    );
  }

  return (
    <div className="documents-page" style={{
      background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
      minHeight: 'calc(100vh - 200px)',
      padding: '1.5rem',
      borderRadius: '12px',
      boxShadow: '0 20px 60px rgba(20, 184, 166, 0.3)',
    }}>
      <div className="page-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
        padding: '1.5rem',
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(10px)',
      }}>
        <h1 style={{
          margin: 0,
          fontSize: '2rem',
          fontWeight: 700,
          background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>Document Management</h1>
        <button
          type="button"
          onClick={openUploadModal}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(20, 184, 166, 0.4)',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(20, 184, 166, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(20, 184, 166, 0.4)';
          }}
        >
          + Upload Document
        </button>
      </div>

      {/* Document Management Sections */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1.5rem',
        marginBottom: '1.5rem',
      }}>
        {/* Clinical Print Templates */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '12px',
          padding: '1.5rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
          gridColumn: 'span 2',
        }}>
          <h3 style={{
            margin: '0 0 1rem 0',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#0d9488',
          }}>Clinical Print Templates</h3>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Open office-editable pre-made templates for patient printouts: lab results, prescription instructions,
            aftercare, rash care, and cleansing routines.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            <button onClick={() => openTemplateLibrary('lab_results')} style={{
              padding: '0.75rem',
              background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}>Lab Result Templates</button>
            <button onClick={() => openTemplateLibrary('prescription_instructions')} style={{
              padding: '0.75rem',
              background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}>Prescription Templates</button>
            <button onClick={() => openTemplateLibrary('aftercare')} style={{
              padding: '0.75rem',
              background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}>Aftercare Templates</button>
            <button onClick={() => openTemplateLibrary('rash_care')} style={{
              padding: '0.75rem',
              background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}>Rash Care Templates</button>
            <button onClick={() => openTemplateLibrary('cleansing')} style={{
              padding: '0.75rem',
              background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}>Cleansing Templates</button>
            <button onClick={() => openTemplateLibrary()} style={{
              padding: '0.75rem',
              background: '#ffffff',
              color: '#0d9488',
              border: '2px solid #14b8a6',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}>Open Full Template Library</button>
          </div>
        </div>

        {/* Patient Attachments */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '12px',
          padding: '1.5rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
        }}>
          <h3 style={{
            margin: '0 0 1rem 0',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#0d9488',
          }}>Patient Attachments</h3>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Upload attachments (images, scans, etc) and associate them with patients or add to the fax queue.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={openUploadModal} style={{
              flex: 1,
              padding: '0.75rem',
              background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}>Upload New Attachments</button>
            <button style={{
              flex: 1,
              padding: '0.75rem',
              background: '#ffffff',
              color: '#0d9488',
              border: '2px solid #14b8a6',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}>Associate Attachments with Patients</button>
          </div>
        </div>

        {/* Physician Specialties and Referral Contacts */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '12px',
          padding: '1.5rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
        }}>
          <h3 style={{
            margin: '0 0 1rem 0',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#0d9488',
          }}>Physician Specialties and Referral Contacts</h3>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Create and update your referral contacts, mark them as active or inactive.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button style={{
              padding: '0.75rem',
              background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}>Manage Referral Contacts</button>
            <button style={{
              padding: '0.75rem',
              background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}>Manage Physician Specialties</button>
          </div>
        </div>

        {/* Faxes Section */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '12px',
          padding: '1.5rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
        }}>
          <h3 style={{
            margin: '0 0 1rem 0',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#0d9488',
          }}>Faxes</h3>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Manage incoming and outgoing faxes.
          </p>
          <button style={{
            width: '100%',
            padding: '0.75rem',
            background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}>Manage Faxes</button>
        </div>

        {/* Forms & Consents Section */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '12px',
          padding: '1.5rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
        }}>
          <h3 style={{
            margin: '0 0 1rem 0',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#0d9488',
          }}>Forms & Consents</h3>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Intake, consent, and procedure form documents are managed here.
          </p>
          <button
            type="button"
            onClick={openFormsWorkspace}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
          >
            Open Forms Workspace
          </button>
        </div>
      </div>

      {isConsentWorkspaceActive && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.97)',
          borderRadius: '16px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          boxShadow: '0 12px 32px rgba(15, 23, 42, 0.14)',
          border: '1px solid rgba(20, 184, 166, 0.16)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
            marginBottom: '1.25rem',
            flexWrap: 'wrap',
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
                Kiosk Consent Workspace
              </h2>
              <p style={{ margin: '0.5rem 0 0 0', color: '#475569', maxWidth: '50rem', lineHeight: 1.6 }}>
                Edit the practice&apos;s live treatment and HIPAA forms here. Changes save back to the kiosk
                consent catalog for this practice, with a built-in preview before patients see them.
              </p>
            </div>
            {canManageConsentForms && (
              <button
                type="button"
                onClick={handleStartNewConsent}
                style={{
                  padding: '0.8rem 1.2rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
                  color: '#ffffff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                + New Consent Form
              </button>
            )}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.25rem',
            alignItems: 'start',
          }}>
            <div style={{
              border: '1px solid #dbeafe',
              borderRadius: '14px',
              background: '#f8fafc',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '1rem 1rem 0.75rem 1rem',
                borderBottom: '1px solid #dbeafe',
                background: '#eff6ff',
              }}>
                <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '0.25rem' }}>
                  Available Forms
                </div>
                <div style={{ fontSize: '0.875rem', color: '#475569' }}>
                  {consentForms.length} template{consentForms.length === 1 ? '' : 's'}
                </div>
              </div>

              {consentFormsLoading ? (
                <div style={{ padding: '1rem' }}>
                  <Skeleton variant="card" height={72} />
                  <Skeleton variant="card" height={72} />
                </div>
              ) : consentForms.length === 0 ? (
                <div style={{ padding: '1rem', color: '#475569', lineHeight: 1.6 }}>
                  No kiosk consent forms are configured yet.
                </div>
              ) : (
                <div style={{ maxHeight: '36rem', overflowY: 'auto' }}>
                  {consentForms.map((form) => {
                    const isSelected = form.id === selectedConsentId;
                    return (
                      <button
                        key={form.id}
                        type="button"
                        onClick={() => handleSelectConsentForm(form)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '1rem',
                          border: 'none',
                          borderBottom: '1px solid #e2e8f0',
                          cursor: 'pointer',
                          background: isSelected ? '#dcfce7' : '#ffffff',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{form.formName}</div>
                            <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: '#475569' }}>
                              {getConsentTypeLabel(form.formType)} · v{form.version || '1.0'}
                            </div>
                          </div>
                          <div style={{
                            alignSelf: 'flex-start',
                            padding: '0.2rem 0.55rem',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: form.isActive ? '#d1fae5' : '#e2e8f0',
                            color: form.isActive ? '#065f46' : '#475569',
                          }}>
                            {form.isActive ? 'Active' : 'Inactive'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '1.25rem',
            }}>
              <div style={{
                border: '1px solid #dbeafe',
                borderRadius: '14px',
                background: '#ffffff',
                padding: '1.25rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800, color: '#0f172a' }}>
                      {selectedConsentForm ? 'Edit Consent Form' : 'Create Consent Form'}
                    </h3>
                    <p style={{ margin: '0.4rem 0 0 0', color: '#64748b', fontSize: '0.875rem' }}>
                      Use HTML for formatting. The preview updates as you edit.
                    </p>
                  </div>
                  {!canManageConsentForms && (
                    <div style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: '999px',
                      background: '#fef3c7',
                      color: '#92400e',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      height: 'fit-content',
                    }}>
                      Read Only
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div style={{ display: 'grid', gap: '0.35rem' }}>
                    <label htmlFor="consent-form-name" style={{ fontWeight: 700, color: '#0f172a' }}>
                      Form Name
                    </label>
                    <input
                      id="consent-form-name"
                      type="text"
                      value={consentDraft.formName}
                      disabled={!canManageConsentForms}
                      onChange={(e) => setConsentDraft((prev) => ({ ...prev, formName: e.target.value }))}
                      placeholder="Consent form title"
                      style={{
                        padding: '0.8rem 0.9rem',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                      <label htmlFor="consent-form-type" style={{ fontWeight: 700, color: '#0f172a' }}>
                        Form Type
                      </label>
                      <input
                        id="consent-form-type"
                        list="consent-form-type-options"
                        value={consentDraft.formType}
                        disabled={!canManageConsentForms}
                        onChange={(e) => setConsentDraft((prev) => ({ ...prev, formType: e.target.value }))}
                        placeholder="general-consent"
                        style={{
                          padding: '0.8rem 0.9rem',
                          borderRadius: '10px',
                          border: '1px solid #cbd5e1',
                        }}
                      />
                      <datalist id="consent-form-type-options">
                        {COMMON_CONSENT_TYPES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </datalist>
                    </div>

                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                      <label htmlFor="consent-form-version" style={{ fontWeight: 700, color: '#0f172a' }}>
                        Version
                      </label>
                      <input
                        id="consent-form-version"
                        type="text"
                        value={consentDraft.version}
                        disabled={!canManageConsentForms}
                        onChange={(e) => setConsentDraft((prev) => ({ ...prev, version: e.target.value }))}
                        placeholder="1.0"
                        style={{
                          padding: '0.8rem 0.9rem',
                          borderRadius: '10px',
                          border: '1px solid #cbd5e1',
                        }}
                      />
                    </div>

                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                      <label htmlFor="consent-effective-date" style={{ fontWeight: 700, color: '#0f172a' }}>
                        Effective Date
                      </label>
                      <input
                        id="consent-effective-date"
                        type="date"
                        value={normalizeDateInputValue(consentDraft.effectiveDate)}
                        disabled={!canManageConsentForms}
                        onChange={(e) => setConsentDraft((prev) => ({ ...prev, effectiveDate: e.target.value }))}
                        style={{
                          padding: '0.8rem 0.9rem',
                          borderRadius: '10px',
                          border: '1px solid #cbd5e1',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <label style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.55rem',
                      padding: '0.7rem 0.9rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                    }}>
                      <input
                        type="checkbox"
                        checked={consentDraft.requiresSignature}
                        disabled={!canManageConsentForms}
                        onChange={(e) => setConsentDraft((prev) => ({ ...prev, requiresSignature: e.target.checked }))}
                      />
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>Requires signature</span>
                    </label>

                    <label style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.55rem',
                      padding: '0.7rem 0.9rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                    }}>
                      <input
                        type="checkbox"
                        checked={consentDraft.isActive}
                        disabled={!canManageConsentForms}
                        onChange={(e) => setConsentDraft((prev) => ({ ...prev, isActive: e.target.checked }))}
                      />
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>Active in kiosk</span>
                    </label>
                  </div>

                  <div style={{ display: 'grid', gap: '0.35rem' }}>
                    <label htmlFor="consent-form-content" style={{ fontWeight: 700, color: '#0f172a' }}>
                      Form HTML
                    </label>
                    <textarea
                      id="consent-form-content"
                      value={consentDraft.formContent}
                      disabled={!canManageConsentForms}
                      onChange={(e) => setConsentDraft((prev) => ({ ...prev, formContent: e.target.value }))}
                      placeholder="<div><h2>Consent title</h2><p>Consent body...</p></div>"
                      rows={18}
                      style={{
                        padding: '0.9rem',
                        borderRadius: '12px',
                        border: '1px solid #cbd5e1',
                        fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
                        fontSize: '0.87rem',
                        lineHeight: 1.6,
                        resize: 'vertical',
                      }}
                    />
                  </div>

                  {consentWorkspaceError && (
                    <div style={{
                      padding: '0.85rem 1rem',
                      borderRadius: '10px',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#991b1b',
                    }}>
                      {consentWorkspaceError}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleSaveConsent}
                      disabled={
                        consentSavePending
                        || !canManageConsentForms
                        || !consentDraft.formName.trim()
                        || !consentDraft.formType.trim()
                        || !consentDraft.formContent.trim()
                      }
                      style={{
                        padding: '0.85rem 1.2rem',
                        borderRadius: '10px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
                        color: '#ffffff',
                        fontWeight: 700,
                        cursor: consentSavePending ? 'wait' : 'pointer',
                      }}
                    >
                      {consentSavePending ? 'Saving...' : selectedConsentForm ? 'Save Changes' : 'Create Consent Form'}
                    </button>
                    <button
                      type="button"
                      onClick={handleResetConsentDraft}
                      disabled={consentSavePending}
                      style={{
                        padding: '0.85rem 1.2rem',
                        borderRadius: '10px',
                        border: '1px solid #94a3b8',
                        background: '#ffffff',
                        color: '#0f172a',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Reset
                    </button>
                    {session?.user.role === 'admin' && selectedConsentForm && selectedConsentForm.isActive && (
                      <button
                        type="button"
                        onClick={handleDeactivateSelectedConsent}
                        disabled={consentSavePending}
                        style={{
                          padding: '0.85rem 1.2rem',
                          borderRadius: '10px',
                          border: '1px solid #fca5a5',
                          background: '#fef2f2',
                          color: '#b91c1c',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Retire Form
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div style={{
                border: '1px solid #dbeafe',
                borderRadius: '14px',
                background: '#f8fafc',
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '1rem 1.25rem',
                  borderBottom: '1px solid #dbeafe',
                  background: '#eff6ff',
                }}>
                  <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800, color: '#0f172a' }}>
                    Live Preview
                  </h3>
                  <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.875rem', color: '#64748b' }}>
                    This preview reflects the HTML patients will read during kiosk check-in.
                  </p>
                </div>
                <div style={{ padding: '1.25rem', minHeight: '34rem', maxHeight: '46rem', overflowY: 'auto' }}>
                  {consentDraft.formContent.trim() ? (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(consentDraft.formContent),
                      }}
                    />
                  ) : (
                    <div style={{ color: '#64748b', lineHeight: 1.7 }}>
                      Enter HTML content to preview this form.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="documents-filters" style={{
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1rem',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(10px)',
      }}>
        <div className="search-box">
          <input
            type="text"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '0.75rem',
              border: '2px solid #14b8a6',
              borderRadius: '8px',
              width: '100%',
              fontSize: '0.875rem',
            }}
          />
        </div>

        <div className="filter-group">
          <label>Patient:</label>
          <select
            value={selectedPatient}
            onChange={(e) => setSelectedPatient(e.target.value)}
          >
            <option value="all">All Patients</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.lastName}, {p.firstName}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-tabs">
          <button
            type="button"
            className={`filter-tab ${categoryFilter === 'all' && !recentFilter ? 'active' : ''}`}
            onClick={() => {
              setCategoryFilter('all');
              setRecentFilter(false);
              const params = new URLSearchParams(searchParams);
              params.delete('filter');
              setSearchParams(params);
            }}
          >
            All
          </button>
          <button
            type="button"
            className={`filter-tab ${recentFilter ? 'active' : ''}`}
            onClick={() => {
              setRecentFilter(true);
              setCategoryFilter('all');
              const params = new URLSearchParams(searchParams);
              params.set('filter', 'recent');
              setSearchParams(params);
            }}
          >
            Recent (7 days)
          </button>
          {DOC_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              className={`filter-tab ${categoryFilter === cat.value ? 'active' : ''}`}
              onClick={() => {
                setCategoryFilter(cat.value);
                setRecentFilter(false);
                const params = new URLSearchParams(searchParams);
                params.delete('filter');
                setSearchParams(params);
              }}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        <div className="view-toggle">
          <button
            type="button"
            className={viewMode === 'grid' ? 'active' : ''}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            ▦
          </button>
          <button
            type="button"
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Documents Display */}
      {filteredDocuments.length === 0 ? (
        <Panel title="">
          <div className="empty-state">
            <div className="empty-icon"></div>
            <h3>No documents found</h3>
            <p className="muted">
              {categoryFilter !== 'all' || selectedPatient !== 'all'
                ? 'Try adjusting your filters'
                : 'Upload your first document'}
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={openUploadModal}
            >
              Upload Document
            </button>
          </div>
        </Panel>
      ) : viewMode === 'grid' ? (
        <div className="document-grid">
          {filteredDocuments.map((doc) => {
            const catInfo = getCategoryInfo(doc.category);
            const categoryClass = toDocCategory(doc.category);
            return (
              <a
                key={doc.id}
                href={getDocUrl(doc)}
                target="_blank"
                rel="noopener noreferrer"
                className="document-card"
              >
                <div className="document-icon">{getFileIcon(doc.mimeType)}</div>
                <div className="document-info">
                  <div className="document-title strong">
                    {doc.title || doc.filename}
                  </div>
                  <div className="document-patient muted">
                    {getPatientName(doc.patientId)}
                  </div>
                  <div className="document-meta">
                    <span className={`pill subtle ${categoryClass}`}>
                      {catInfo.icon} {catInfo.label}
                    </span>
                    <span className="muted tiny">{formatFileSize(doc.fileSize)}</span>
                  </div>
                  <div className="document-date muted tiny">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="document-list">
          {filteredDocuments.map((doc) => {
            const catInfo = getCategoryInfo(doc.category);
            const categoryClass = toDocCategory(doc.category);
            return (
              <a
                key={doc.id}
                href={getDocUrl(doc)}
                target="_blank"
                rel="noopener noreferrer"
                className="document-list-item"
              >
                <div className="document-list-icon">{getFileIcon(doc.mimeType)}</div>
                <div className="document-list-content">
                  <div className="document-list-header">
                    <span className="strong">{doc.title || doc.filename}</span>
                    <span className={`pill ${categoryClass}`}>
                      {catInfo.icon} {catInfo.label}
                    </span>
                  </div>
                  <div className="document-list-patient">
                    Patient: {getPatientName(doc.patientId)}
                  </div>
                  {doc.description && (
                    <div className="document-desc muted">{doc.description}</div>
                  )}
                  <div className="document-list-meta muted tiny">
                    <span>{formatFileSize(doc.fileSize)}</span>
                    <span>Uploaded: {new Date(doc.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      <Modal
        isOpen={showUploadModal}
        title="Upload Document"
        onClose={() => {
          setShowUploadModal(false);
          resetUploadForm();
          // Clear the action parameter from URL when closing modal
          clearUploadActionParam();
        }}
        size="lg"
      >
        <div className="modal-form">
          <div className="form-field">
            <label>Patient *</label>
            <select
              value={uploadForm.patientId}
              onChange={(e) =>
                setUploadForm((prev) => ({ ...prev, patientId: e.target.value }))
              }
            >
              <option value="">Select patient...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Category</label>
              <select
                value={uploadForm.category}
                onChange={(e) =>
                  setUploadForm((prev) => ({
                    ...prev,
                    category: e.target.value as DocCategory,
                  }))
                }
              >
                {DOC_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Document Title</label>
              <input
                type="text"
                value={uploadForm.title}
                onChange={(e) =>
                  setUploadForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Document title"
              />
            </div>
          </div>

          <div className="form-field">
            <label>Description</label>
            <textarea
              value={uploadForm.description}
              onChange={(e) =>
                setUploadForm((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Optional description..."
              rows={3}
            />
          </div>

          <div className="form-field">
            <label>File *</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            {uploadForm.file ? (
              <div className="file-selected">
                <div className="file-info">
                  <span className="file-icon">{getFileIcon(uploadForm.file.type)}</span>
                  <div>
                    <div className="strong">{uploadForm.file.name}</div>
                    <div className="muted tiny">
                      {formatFileSize(uploadForm.file.size)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-sm btn-secondary"
                  onClick={clearSelectedFile}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div
                className={`upload-dropzone ${isUploadDragOver ? 'drag-active' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={() => setIsUploadDragOver(true)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsUploadDragOver(true);
                }}
                onDragLeave={() => setIsUploadDragOver(false)}
                onDrop={handleUploadDrop}
              >
                <div className="upload-icon"></div>
                <p>Drag and drop a document here</p>
                <p className="muted tiny">PDF, Word, Excel, images supported</p>
                <div className="upload-dropzone-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    Browse Files
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      cameraInputRef.current?.click();
                    }}
                  >
                    Take Photo
                  </button>
                </div>
              </div>
            )}
            {uploadForm.file && uploadForm.previewUrl && getPreviewKind(uploadForm.file) !== 'none' && (
              <div className="document-upload-preview">
                {getPreviewKind(uploadForm.file) === 'image' ? (
                  <img src={uploadForm.previewUrl} alt="Document preview" />
                ) : (
                  <iframe src={uploadForm.previewUrl} title="Document preview" />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowUploadModal(false);
              resetUploadForm();
              clearUploadActionParam();
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleUpload}
            disabled={uploading || !uploadForm.file || !uploadForm.patientId}
          >
            {uploading ? 'Uploading...' : 'Upload Document'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
