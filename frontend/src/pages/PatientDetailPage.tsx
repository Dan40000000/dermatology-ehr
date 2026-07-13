import { useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal } from '../components/ui';
import { PatientBanner } from '../components/clinical';
import { PatientBodyDiagram } from '../components/body-diagram';
import { ScribePanel } from '../components/ScribePanel';
import { ClinicalCopilotPanel } from '../components/ClinicalCopilotPanel';
import { ClinicalTrendsTab } from '../components/clinical/ClinicalTrendsTab';
// Lesion type no longer needed - using PatientBodyDiagram with BodyMarker type
import {
  PatientBalanceSummary,
  PatientCostEstimatePanel,
  PatientScribeSnapshot,
  PatientScribeSummaries,
  TasksTab,
} from '../components/patient';
import { RxHistoryTab } from '../components/RxHistoryTab';
import { ActiveMedicationsCard } from '../components/prescriptions';
import { PharmacySearch, type Pharmacy } from '../components/prescriptions/PharmacySearch';
import { CoverageSummaryCard } from '../components/Insurance/CoverageSummaryCard';
import { InsuranceLookupPanel } from '../components/workflows';
import { ResultFlagBadge } from '../components/ResultFlagBadge';
import { hasAnyRole, hasRole } from '../utils/roles';
import { formatPhoneDisplay } from '../utils/phone';
import { calculateAgeFromDateOnly, formatDateOnly } from '../utils/dateOnly';
import {
  ACCESSIBILITY_COMMUNICATION_OPTIONS,
  ACCESSIBILITY_EQUIPMENT_OPTIONS,
  buildVisitPrepChecklist,
  getAccessibilityNeedLabels,
  getAccessibilitySummary,
  hasAccessibilityNeeds,
  normalizeAccessibilityProfile,
} from '../utils/accessibilityAccommodations';
import {
  fetchPatient,
  fetchEncounters,
  fetchAppointments,
  fetchDocuments,
  fetchPhotos,
  fetchVitals,
  fetchOrders,
  fetchPrescriptionsEnhanced,
  fetchTasks,
  fetchReferrals,
  fetchPatientClinicalSummary,
  fetchEligibilityHistory,
  verifyPatientEligibility,
  deletePatient,
  createPatientRecall,
  updateDiagnosis,
  deleteDiagnosis,
  uploadPhotoFile,
  createPhoto,
  fetchRecallCampaigns,
  getPresignedAccess,
  signUploadKey,
  recordPrintedDocument,
  API_BASE_URL,
  TENANT_HEADER_NAME,
} from '../api';
import type { PatientClinicalSummary, PatientDiagnosisSummary, PatientRecallSummary, RecallCampaign, Vital } from '../api';
import type {
  Patient,
  Encounter,
  Appointment,
  Document,
  Photo,
  Prescription,
  Referral,
  Task,
  Order,
  PhotoType,
  UserRole,
  PatientAccessibilityProfile,
} from '../types';
import { cleanAiDiagnosisDescription, isAiSuggestedDiagnosis } from '../utils/diagnosisReview';

type TabId = 'overview' | 'demographics' | 'accessibility' | 'insurance' | 'account' | 'medical-history' | 'clinical-summary' | 'clinical-trends' | 'encounters' | 'appointments' | 'orders' | 'referrals' | 'documents' | 'photos' | 'timeline' | 'rx-history' | 'tasks' | 'scribe';
const VALID_PATIENT_DETAIL_TABS = new Set<TabId>([
  'overview',
  'demographics',
  'accessibility',
  'insurance',
  'account',
  'medical-history',
  'clinical-summary',
  'clinical-trends',
  'encounters',
  'appointments',
  'orders',
  'referrals',
  'documents',
  'photos',
  'timeline',
  'rx-history',
  'tasks',
  'scribe',
]);
const CLINICAL_PATIENT_ROLES: UserRole[] = ['admin', 'provider', 'ma', 'nurse', 'manager', 'compliance_officer'];
const CLINICAL_PATIENT_TABS = new Set<TabId>([
  'medical-history',
  'clinical-summary',
  'clinical-trends',
  'encounters',
  'orders',
  'referrals',
  'photos',
  'rx-history',
  'scribe',
]);

const PHOTO_BODY_LOCATIONS = [
  'Face',
  'Scalp',
  'Neck',
  'Chest',
  'Back',
  'Abdomen',
  'Upper Arm (L)',
  'Upper Arm (R)',
  'Forearm (L)',
  'Forearm (R)',
  'Hand (L)',
  'Hand (R)',
  'Upper Leg (L)',
  'Upper Leg (R)',
  'Lower Leg (L)',
  'Lower Leg (R)',
  'Foot (L)',
  'Foot (R)',
  'Other',
];

const PHOTO_TYPE_OPTIONS: Array<{ value: PhotoType; label: string }> = [
  { value: 'clinical', label: 'Clinical' },
  { value: 'before', label: 'Before Treatment' },
  { value: 'after', label: 'After Treatment' },
  { value: 'dermoscopy', label: 'Dermoscopy' },
  { value: 'baseline', label: 'Baseline' },
];

const ACTIVE_APPOINTMENT_STATUSES = new Set<Appointment['status']>([
  'scheduled',
  'checked_in',
  'in_room',
  'with_provider',
  'checkout',
]);

function formatPharmacyAddress(pharmacy: Partial<Pharmacy>): string {
  return [
    pharmacy.street,
    [pharmacy.city, pharmacy.state, pharmacy.zip].filter(Boolean).join(', ').replace(', ,', ','),
  ].filter(Boolean).join(', ');
}

function getAppointmentTimeValue(appointment: Appointment): number {
  const timestamp = new Date(appointment.scheduledStart).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortAppointmentsForPatientChart(appointments: Appointment[]): Appointment[] {
  return [...appointments].sort((a, b) => {
    const aIsActive = ACTIVE_APPOINTMENT_STATUSES.has(a.status);
    const bIsActive = ACTIVE_APPOINTMENT_STATUSES.has(b.status);
    const aTime = getAppointmentTimeValue(a);
    const bTime = getAppointmentTimeValue(b);

    if (aIsActive !== bIsActive) {
      return aIsActive ? -1 : 1;
    }

    if (aIsActive) {
      return aTime - bTime;
    }

    return bTime - aTime;
  });
}

function getNextRelevantAppointment(appointments: Appointment[]): Appointment | null {
  return (
    sortAppointmentsForPatientChart(
      appointments.filter((appointment) => appointment.status !== 'cancelled' && appointment.status !== 'no_show')
    )[0] || null
  );
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildFaceSheetHtml(patient: Patient, nextAppointment: Appointment | null): string {
  const patientName = `${patient.lastName}, ${patient.firstName}`.trim();
  const address = [patient.address, patient.city, patient.state, patient.zip].filter(Boolean).join(', ');
  const insurance = typeof patient.insurance === 'string'
    ? patient.insurance
    : patient.insurance
      ? 'Insurance on file'
      : 'No insurance on file';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Face Sheet - ${escapeHtml(patientName)}</title>
    <style>
      body { font-family: Georgia, "Times New Roman", serif; margin: 32px; color: #111827; }
      h1 { margin-bottom: 4px; }
      .muted { color: #6b7280; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 24px; }
      .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 14px; }
      .label { font-weight: 700; color: #374151; }
      .row { margin: 6px 0; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(patientName)}</h1>
    <div class="muted">DOB: ${escapeHtml(formatDateOnly(patient.dob) || 'N/A')} | Sex: ${escapeHtml(patient.sex || 'N/A')}</div>
    <div class="grid">
      <section class="card">
        <h2>Contact</h2>
        <div class="row"><span class="label">Phone:</span> ${escapeHtml(formatPhoneDisplay(patient.phone) || 'N/A')}</div>
        <div class="row"><span class="label">Email:</span> ${escapeHtml(patient.email || 'N/A')}</div>
        <div class="row"><span class="label">Address:</span> ${escapeHtml(address || 'N/A')}</div>
      </section>
      <section class="card">
        <h2>Insurance</h2>
        <div>${escapeHtml(insurance)}</div>
      </section>
      <section class="card">
        <h2>Allergies</h2>
        <div>${escapeHtml(Array.isArray(patient.allergies) ? patient.allergies.join(', ') : patient.allergies || 'None reported')}</div>
      </section>
      <section class="card">
        <h2>Medications</h2>
        <div>${escapeHtml(patient.medications || 'None on file')}</div>
      </section>
      <section class="card">
        <h2>Next Appointment</h2>
        <div>${escapeHtml(nextAppointment ? `${new Date(nextAppointment.scheduledStart).toLocaleString()} with ${nextAppointment.providerName || 'Provider'}` : 'None scheduled')}</div>
      </section>
    </div>
  </body>
</html>`;
}

type MedicalHistoryAllergy = {
  name: string;
  allergen?: string;
  allergenName?: string;
  reaction?: string;
  severity?: string;
};

type MedicalHistoryMedication = {
  name: string;
  medicationName?: string;
  dosage?: string;
  sig?: string;
  prescribedDate?: string | null;
};

const NO_KNOWN_HISTORY_VALUES = new Set([
  'none',
  'none known',
  'no known allergies',
  'no known drug allergies',
  'no allergies',
  'nka',
  'nkda',
]);

function splitHistoryList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter((item) => item && !NO_KNOWN_HISTORY_VALUES.has(item.toLowerCase()));
  }

  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed || NO_KNOWN_HISTORY_VALUES.has(trimmed.toLowerCase())) return [];

  return trimmed
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter((item) => item && !NO_KNOWN_HISTORY_VALUES.has(item.toLowerCase()));
}

function parseAllergyText(entry: string): MedicalHistoryAllergy {
  const parenMatch = entry.match(/^(.+?)\s*\((.+?)\)\s*$/);
  if (parenMatch?.[1] && parenMatch?.[2]) {
    return {
      name: parenMatch[1].trim(),
      reaction: parenMatch[2].trim(),
      severity: 'unknown',
    };
  }

  return { name: entry, reaction: 'Unknown', severity: 'unknown' };
}

function getMedicalHistoryAllergies(patient: Patient): MedicalHistoryAllergy[] {
  const structured = (patient as any).allergiesList;
  if (Array.isArray(structured) && structured.length > 0) {
    return structured
      .map((allergy: any) => {
        const name = allergy.name || allergy.allergenName || allergy.allergen || '';
        if (!name) return null;
        return {
          ...allergy,
          name,
          reaction: allergy.reaction || allergy.reactionType || 'Unknown',
          severity: (allergy.severity || 'unknown').toLowerCase(),
        };
      })
      .filter(Boolean) as MedicalHistoryAllergy[];
  }

  return splitHistoryList(patient.allergies).map(parseAllergyText);
}

function getMedicalHistoryMedications(patient: Patient): MedicalHistoryMedication[] {
  const structured = (patient as any).medicationsList;
  if (Array.isArray(structured) && structured.length > 0) {
    return structured
      .map((medication: any) => {
        const name = medication.name || medication.medicationName || '';
        if (!name) return null;
        return {
          ...medication,
          name,
          dosage: medication.dosage || medication.sig || '',
          prescribedDate: medication.prescribedDate || null,
        };
      })
      .filter(Boolean) as MedicalHistoryMedication[];
  }

  return splitHistoryList(patient.medications).map((name) => ({
    name,
    dosage: '',
    prescribedDate: null,
  }));
}

function formatHistoryDate(dateValue?: string | null): string {
  if (!dateValue) return 'Not on file';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'Not on file';
  return date.toLocaleDateString();
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonthsDateInputValue(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + Math.max(1, months || 1));
  return toDateInputValue(date);
}

function getDefaultRecallDueDate(campaign?: RecallCampaign | null): string {
  return addMonthsDateInputValue(campaign?.intervalMonths || 12);
}

export function PatientDetailPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();
  const scribeParam = searchParams.get('scribe') === '1';
  const autoStartScribe = scribeParam && searchParams.get('auto') === '1';
  const encounterIdParam = searchParams.get('encounterId') || undefined;
  const providerIdParam = searchParams.get('providerId') || undefined;
  const requestedTab = searchParams.get('tab') || (scribeParam && !autoStartScribe ? 'scribe' : null);

  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [vitalsHistory, setVitalsHistory] = useState<Vital[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clinicalSummary, setClinicalSummary] = useState<PatientClinicalSummary>({ diagnoses: [], recalls: [] });
  const [recallCampaigns, setRecallCampaigns] = useState<RecallCampaign[]>([]);
  const [showAddRecallModal, setShowAddRecallModal] = useState(false);
  const [isLoadingRecallCampaigns, setIsLoadingRecallCampaigns] = useState(false);
  const [isCreatingRecall, setIsCreatingRecall] = useState(false);
  const [recallForm, setRecallForm] = useState({
    campaignId: '',
    dueDate: addMonthsDateInputValue(12),
    recallType: 'Manual Recall',
    notes: '',
  });
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [scribeArchiveRefreshKey, setScribeArchiveRefreshKey] = useState(0);
  // Body diagram state is now managed by the PatientBodyDiagram component
  const [showFaceSheet, setShowFaceSheet] = useState(false);
  const [highlightScribe, setHighlightScribe] = useState(false);
  const scribeContainerRef = useRef<HTMLDivElement | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);

  // Modal states
  const [editDemographicsOpen, setEditDemographicsOpen] = useState(false);
  const [editAccessibilityOpen, setEditAccessibilityOpen] = useState(false);
  const [editInsuranceOpen, setEditInsuranceOpen] = useState(false);
  const [editAllergyOpen, setEditAllergyOpen] = useState(false);
  const [editMedicationOpen, setEditMedicationOpen] = useState(false);
  const [editProblemOpen, setEditProblemOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [resolvedPhotoUrls, setResolvedPhotoUrls] = useState<Record<string, string>>({});
  const [showPhotoUploadModal, setShowPhotoUploadModal] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isPhotoUploadDragOver, setIsPhotoUploadDragOver] = useState(false);
  const photoFileInputRef = useRef<HTMLInputElement | null>(null);
  const photoCameraInputRef = useRef<HTMLInputElement | null>(null);
  const [photoUploadForm, setPhotoUploadForm] = useState({
    bodyLocation: '',
    description: '',
    photoType: 'clinical' as PhotoType,
    file: null as File | null,
    previewUrl: '',
  });
  const buildInitialPhotoUploadForm = (
    overrides?: Partial<{
      bodyLocation: string;
      description: string;
      photoType: PhotoType;
      file: File | null;
      previewUrl: string;
    }>
  ) => ({
    bodyLocation: '',
    description: '',
    photoType: 'clinical' as PhotoType,
    file: null as File | null,
    previewUrl: '',
    ...(overrides || {}),
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [diagnosisReviewActionId, setDiagnosisReviewActionId] = useState<string | null>(null);
  const canViewClinicalPatientData =
    !session?.user || hasAnyRole(session.user, CLINICAL_PATIENT_ROLES);
  const canManageDiagnoses = Boolean(session?.user && hasAnyRole(session.user, ['admin', 'provider']));

  // Body markers are now managed by PatientBodyDiagram component

  const loadPatientData = useCallback(async () => {
    if (!session || !patientId) return;

    setLoading(true);
    try {
      // Only the patient record is page-fatal. Some roles can view the patient
      // but are not allowed to load every clinical side panel.
      const patientRes = await fetchPatient(session.tenantId, session.accessToken, patientId);

      if (patientRes.patient) {
        setPatient(patientRes.patient);
      } else {
        showError('Patient not found');
        navigate('/patients');
        return;
      }

      const [encountersRes, appointmentsRes] = await Promise.all([
        canViewClinicalPatientData
          ? fetchEncounters(session.tenantId, session.accessToken).catch(() => ({ encounters: [] as Encounter[] }))
          : Promise.resolve({ encounters: [] as Encounter[] }),
        fetchAppointments(session.tenantId, session.accessToken, { patientId }).catch(() => ({ appointments: [] as Appointment[] })),
      ]);

      setEncounters((encountersRes.encounters || []).filter((e: Encounter) => e.patientId === patientId));
      // Appointments are already filtered by patientId at the API level.
      setAppointments(appointmentsRes.appointments || []);

      // Non-critical fetches - don't fail the page if these fail
      if (canViewClinicalPatientData) {
        try {
          const clinicalSummaryRes = await fetchPatientClinicalSummary(session.tenantId, session.accessToken, patientId);
          setClinicalSummary({
            diagnoses: clinicalSummaryRes.diagnoses || [],
            recalls: clinicalSummaryRes.recalls || [],
          });
        } catch {
          setClinicalSummary({ diagnoses: [], recalls: [] });
        }
      } else {
        setClinicalSummary({ diagnoses: [], recalls: [] });
      }

      if (canViewClinicalPatientData) {
        try {
          const vitalsRes = await fetchVitals(session.tenantId, session.accessToken, patientId);
          setVitalsHistory(vitalsRes.vitals || []);
        } catch {
          setVitalsHistory([]);
        }
      } else {
        setVitalsHistory([]);
      }

      try {
        const documentsRes = await fetchDocuments(session.tenantId, session.accessToken);
        setDocuments(
          (documentsRes.documents || []).filter((d: Document) => d.patientId === patientId)
        );
      } catch {
        setDocuments([]);
      }

      if (canViewClinicalPatientData) {
        try {
          const photosRes = await fetchPhotos(session.tenantId, session.accessToken, { patientId });
          setPhotos(
            (photosRes.photos || []).filter(
              (p: Photo & { patient_id?: string }) => p.patientId === patientId || p.patient_id === patientId
            )
          );
        } catch {
          setPhotos([]);
        }
      } else {
        setPhotos([]);
      }

      try {
        const tasksRes = await fetchTasks(session.tenantId, session.accessToken);
        setTasks(
          (tasksRes.tasks || []).filter((t: Task) => t.patientId === patientId)
        );
      } catch {
        setTasks([]);
      }

      if (canViewClinicalPatientData) {
        try {
          const prescriptionsRes = await fetchPrescriptionsEnhanced(session.tenantId, session.accessToken, { patientId });
          setPrescriptions(prescriptionsRes.prescriptions || []);
        } catch {
          setPrescriptions([]);
        }
      } else {
        setPrescriptions([]);
      }

      if (canViewClinicalPatientData) {
        try {
          const ordersRes = await fetchOrders(session.tenantId, session.accessToken, { patientId });
          setOrders(ordersRes.orders || []);
        } catch {
          setOrders([]);
        }
      } else {
        setOrders([]);
      }

      if (canViewClinicalPatientData) {
        try {
          const referralsRes = await fetchReferrals(session.tenantId, session.accessToken, { patientId });
          setReferrals(referralsRes.referrals || []);
        } catch {
          setReferrals([]);
        }
      } else {
        setReferrals([]);
      }
    } catch (err: any) {
      if (err.message === 'Patient not found') {
        showError('Patient not found');
        navigate('/patients');
        return;
      }
      showError(err.message || 'Failed to load patient data');
    } finally {
      setLoading(false);
    }
  }, [session, patientId, showError, navigate, canViewClinicalPatientData]);

  const handleConfirmAiDiagnosis = useCallback(async (diagnosis: PatientDiagnosisSummary) => {
    if (!session || !canManageDiagnoses) {
      showError('Only a provider or admin can confirm diagnoses.');
      return;
    }

    const description = cleanAiDiagnosisDescription(diagnosis.description) || diagnosis.description || 'Diagnosis';
    setDiagnosisReviewActionId(diagnosis.id);
    try {
      await updateDiagnosis(session.tenantId, session.accessToken, diagnosis.id, {
        description,
        isPrimary: Boolean(diagnosis.isPrimary),
      });
      showSuccess('Diagnosis confirmed for the encounter.');
      await loadPatientData();
    } catch (err: any) {
      showError(err.message || 'Failed to confirm diagnosis');
    } finally {
      setDiagnosisReviewActionId(null);
    }
  }, [canManageDiagnoses, loadPatientData, session, showError, showSuccess]);

  const handleRejectAiDiagnosis = useCallback(async (diagnosis: PatientDiagnosisSummary) => {
    if (!session || !canManageDiagnoses) {
      showError('Only a provider or admin can reject diagnoses.');
      return;
    }

    setDiagnosisReviewActionId(diagnosis.id);
    try {
      await deleteDiagnosis(session.tenantId, session.accessToken, diagnosis.id);
      showSuccess('AI diagnosis suggestion rejected.');
      await loadPatientData();
    } catch (err: any) {
      showError(err.message || 'Failed to reject diagnosis');
    } finally {
      setDiagnosisReviewActionId(null);
    }
  }, [canManageDiagnoses, loadPatientData, session, showError, showSuccess]);

  const handleMakeDiagnosisPrimary = useCallback(async (diagnosis: PatientDiagnosisSummary) => {
    if (!session || !canManageDiagnoses) {
      showError('Only a provider or admin can set the primary diagnosis.');
      return;
    }

    setDiagnosisReviewActionId(diagnosis.id);
    try {
      await updateDiagnosis(session.tenantId, session.accessToken, diagnosis.id, { isPrimary: true });
      showSuccess('Primary diagnosis updated.');
      await loadPatientData();
    } catch (err: any) {
      showError(err.message || 'Failed to update primary diagnosis');
    } finally {
      setDiagnosisReviewActionId(null);
    }
  }, [canManageDiagnoses, loadPatientData, session, showError, showSuccess]);

  const resetPhotoUploadForm = () => {
    setPhotoUploadForm((prev) => {
      if (prev.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return {
        bodyLocation: '',
        description: '',
        photoType: 'clinical' as PhotoType,
        file: null,
        previewUrl: '',
      };
    });
    if (photoFileInputRef.current) {
      photoFileInputRef.current.value = '';
    }
    if (photoCameraInputRef.current) {
      photoCameraInputRef.current.value = '';
    }
    setIsPhotoUploadDragOver(false);
  };

  const clearSelectedPhotoUploadFile = () => {
    setPhotoUploadForm((prev) => {
      if (prev.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return { ...prev, file: null, previewUrl: '' };
    });
    if (photoFileInputRef.current) {
      photoFileInputRef.current.value = '';
    }
    if (photoCameraInputRef.current) {
      photoCameraInputRef.current.value = '';
    }
    setIsPhotoUploadDragOver(false);
  };

  const applySelectedPhotoUploadFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      showError('Please select an image file');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPhotoUploadForm((prev) => {
      if (prev.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return { ...prev, file, previewUrl };
    });
  };

  const handleProfilePhotoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      applySelectedPhotoUploadFile(file);
    }
  };

  const handleProfilePhotoDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsPhotoUploadDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      applySelectedPhotoUploadFile(file);
    }
  };

  const getPhotoDisplayUrl = (photo: Photo) => {
    const resolved = resolvedPhotoUrls[photo.id];
    if (resolved) {
      return resolved;
    }
    if (photo.url?.startsWith('/')) {
      return `${API_BASE_URL}${photo.url}`;
    }
    return photo.url;
  };

  const getLocalUploadKey = (photo: Photo) => {
    if (photo.objectKey) {
      return photo.objectKey;
    }
    if (!photo.url) {
      return null;
    }

    try {
      const path = photo.url.startsWith('http')
        ? new URL(photo.url).pathname
        : photo.url;
      const match = path.match(/\/(?:api\/)?uploads\/([^/?#]+)/i);
      if (match?.[1]) {
        return decodeURIComponent(match[1]);
      }
    } catch {
      // Fall through to basic parsing below.
    }

    return null;
  };

  const handleProfilePhotoUpload = async () => {
    if (!session || !patientId || !photoUploadForm.file) {
      showError('Please select a photo');
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const uploadResult = await uploadPhotoFile(
        session.tenantId,
        session.accessToken,
        photoUploadForm.file
      );

      await createPhoto(session.tenantId, session.accessToken, {
        patientId,
        url: uploadResult.url,
        objectKey: uploadResult.objectKey,
        storage: uploadResult.storage,
        photoType: photoUploadForm.photoType,
        bodyLocation: photoUploadForm.bodyLocation || undefined,
        bodyRegion: photoUploadForm.bodyLocation || undefined,
        description: photoUploadForm.description || undefined,
        filename: photoUploadForm.file.name,
        mimeType: photoUploadForm.file.type,
        fileSize: photoUploadForm.file.size,
      });

      showSuccess('Photo uploaded successfully');
      setShowPhotoUploadModal(false);
      resetPhotoUploadForm();
      await loadPatientData();
      setActiveTab('photos');
    } catch (err: any) {
      showError(err.message || 'Failed to upload photo');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const displayAppointments = sortAppointmentsForPatientChart(appointments);
  const nextAppointment = getNextRelevantAppointment(appointments);
  const latestVital = vitalsHistory[0];
  const activeRecalls = clinicalSummary.recalls.filter((recall) => isActiveRecallStatus(recall.status));
  const aiSuggestedDiagnoses = clinicalSummary.diagnoses.filter(isAiSuggestedDiagnosis);
  const confirmedDiagnoses = clinicalSummary.diagnoses.filter((diagnosis) => !isAiSuggestedDiagnosis(diagnosis));
  const clinicalSummaryCount = confirmedDiagnoses.length + aiSuggestedDiagnoses.length + activeRecalls.length;

  useEffect(() => {
    loadPatientData();
  }, [loadPatientData]);

  useEffect(() => {
    const nextTab = requestedTab as TabId | null;
    if (
      nextTab
      && VALID_PATIENT_DETAIL_TABS.has(nextTab)
      && (canViewClinicalPatientData || !CLINICAL_PATIENT_TABS.has(nextTab))
    ) {
      setActiveTab(nextTab);
    } else if (!canViewClinicalPatientData && CLINICAL_PATIENT_TABS.has(activeTab)) {
      setActiveTab('overview');
    }
  }, [activeTab, canViewClinicalPatientData, requestedTab]);

  useEffect(
    () => () => {
      if (photoUploadForm.previewUrl) {
        URL.revokeObjectURL(photoUploadForm.previewUrl);
      }
    },
    [photoUploadForm.previewUrl]
  );

  useEffect(() => {
    if (!session || photos.length === 0) {
      setResolvedPhotoUrls({});
      return;
    }

    let cancelled = false;

    const resolveUrls = async () => {
      const urlEntries = await Promise.all(
        photos.map(async (photo) => {
          try {
            const localUploadKey = getLocalUploadKey(photo);
            if (photo.storage === 'local' || (!photo.storage && localUploadKey)) {
              const key = localUploadKey;
              if (key) {
                const signed = await signUploadKey(session.tenantId, session.accessToken, key);
                const signedUrl = signed.url.startsWith('http')
                  ? signed.url
                  : `${API_BASE_URL}${signed.url}`;
                return [photo.id, signedUrl] as const;
              }
            }

            if (photo.storage === 's3' && photo.objectKey) {
              if (photo.url && /^https?:\/\//.test(photo.url)) {
                return [photo.id, photo.url] as const;
              }
              try {
                const signed = await getPresignedAccess(
                  session.tenantId,
                  session.accessToken,
                  photo.objectKey
                );
                return [photo.id, signed.url] as const;
              } catch {
                // Fallback to persisted URL if presign lookup fails.
              }
            }

            if (photo.url?.startsWith('/')) {
              return [photo.id, `${API_BASE_URL}${photo.url}`] as const;
            }

            return [photo.id, photo.url] as const;
          } catch {
            return [photo.id, photo.url] as const;
          }
        })
      );

      if (!cancelled) {
        setResolvedPhotoUrls(
          Object.fromEntries(urlEntries.filter((entry): entry is [string, string] => Boolean(entry[1])))
        );
      }
    };

    resolveUrls();

    return () => {
      cancelled = true;
    };
  }, [photos, session]);

  useEffect(() => {
    if (!scribeParam || !patient) return;
    const target = scribeContainerRef.current;
    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    setHighlightScribe(true);
    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightScribe(false);
    }, 3500);

    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, [scribeParam, patient?.id]);

  const handleStartEncounter = () => {
    navigate(`/patients/${patientId}/encounter/new`);
  };

  const handleViewEncounter = (encounterId: string) => {
    navigate(`/patients/${patientId}/encounter/${encounterId}`);
  };

  const handlePrintFaceSheet = () => {
    if (!patient) return;
    const html = buildFaceSheetHtml(patient, nextAppointment);

    if (session && patientId) {
      void recordPrintedDocument(session.tenantId, session.accessToken, {
        patientId,
        title: `Face Sheet - ${patient.firstName} ${patient.lastName}`,
        category: 'Printed Documents',
        description: 'Patient face sheet printed from provider chart.',
        html,
        shareToPortal: true,
        notes: 'Automatically saved when the face sheet was printed.',
      }).then(() => {
        showSuccess('Face sheet saved to chart and patient portal');
        void loadPatientData();
      }).catch((error: any) => {
        showError(error.message || 'Face sheet could not be saved to chart');
      });
    }

    window.print();
  };

  const handleDeletePatient = async () => {
    if (!session || !patientId || !patient) return;

    setIsDeleting(true);
    try {
      await deletePatient(session.tenantId, session.accessToken, patientId);
      showSuccess(`Patient ${patient.firstName} ${patient.lastName} has been deleted`);
      setShowDeleteConfirm(false);
      navigate('/patients');
    } catch (error: any) {
      showError(error.message || 'Failed to delete patient');
    } finally {
      setIsDeleting(false);
    }
  };

  const loadRecallCampaigns = useCallback(async () => {
    if (!session) return;
    setIsLoadingRecallCampaigns(true);
    try {
      const result = await fetchRecallCampaigns(session.tenantId, session.accessToken);
      const active = (result.campaigns || []).filter((campaign) => campaign.isActive);
      setRecallCampaigns(active);
      if (!recallForm.campaignId && active[0]) {
        setRecallForm((current) => ({
          ...current,
          campaignId: active[0]!.id,
          dueDate: getDefaultRecallDueDate(active[0]),
        }));
      }
    } catch (error: any) {
      showError(error.message || 'Failed to load recall programs');
    } finally {
      setIsLoadingRecallCampaigns(false);
    }
  }, [recallForm.campaignId, session, showError]);

  const openAddRecallModal = () => {
    const defaultCampaign = recallCampaigns[0] || null;
    setRecallForm({
      campaignId: defaultCampaign?.id || '',
      dueDate: getDefaultRecallDueDate(defaultCampaign),
      recallType: defaultCampaign?.recallType || 'Manual Recall',
      notes: '',
    });
    setShowAddRecallModal(true);
    if (recallCampaigns.length === 0) {
      void loadRecallCampaigns();
    }
  };

  const handleRecallCampaignChange = (campaignId: string) => {
    const campaign = recallCampaigns.find((item) => item.id === campaignId) || null;
    setRecallForm((current) => ({
      ...current,
      campaignId,
      dueDate: getDefaultRecallDueDate(campaign),
      recallType: campaign?.recallType || current.recallType || 'Manual Recall',
    }));
  };

  const handleCreateRecall = async () => {
    if (!session || !patientId || !patient) return;
    if (!recallForm.dueDate) {
      showError('Due date is required');
      return;
    }

    setIsCreatingRecall(true);
    try {
      const campaign = recallCampaigns.find((item) => item.id === recallForm.campaignId);
      await createPatientRecall(session.tenantId, session.accessToken, {
        patientId,
        campaignId: recallForm.campaignId || undefined,
        dueDate: recallForm.dueDate,
        recallType: campaign?.recallType || recallForm.recallType || 'Manual Recall',
        notes: recallForm.notes || undefined,
      });

      showSuccess(`Added ${patient.firstName} ${patient.lastName} to ${campaign?.name || recallForm.recallType || 'recall'} follow-up`);
      setShowAddRecallModal(false);
      setActiveTab('clinical-summary');
      await loadPatientData();
    } catch (error: any) {
      showError(error.message || 'Failed to add recall');
    } finally {
      setIsCreatingRecall(false);
    }
  };

  if (loading) {
    return (
      <div className="patient-detail-page">
        <Skeleton variant="card" height={140} />
        <div style={{ marginTop: '1rem' }}>
          <Skeleton variant="card" height={40} />
        </div>
        <Skeleton variant="card" height={300} />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="patient-detail-page">
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <h3 style={{ color: '#374151', marginBottom: '0.5rem' }}>Patient Not Found</h3>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>The requested patient could not be found.</p>
          <button
            type="button"
            className="ema-action-btn"
            onClick={() => navigate('/patients')}
          >
            Back to Patients
          </button>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: string; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: '' },
    { id: 'demographics', label: 'Demographics', icon: '' },
    { id: 'accessibility', label: 'Access Needs', icon: '', count: patient ? getAccessibilityNeedLabels(patient.accessibilityProfile).length : 0 },
    { id: 'insurance', label: 'Insurance', icon: '' },
    { id: 'account', label: 'Account', icon: '' },
    { id: 'medical-history', label: 'Medical History', icon: '' },
    { id: 'clinical-summary', label: 'Dx & Recalls', icon: '', count: clinicalSummaryCount },
    { id: 'clinical-trends', label: 'Clinical Trends', icon: '📊' },
    { id: 'encounters', label: 'Encounters', icon: '', count: encounters.length },
    { id: 'appointments', label: 'Appointments', icon: '', count: appointments.length },
    { id: 'orders', label: 'Orders', icon: '', count: orders.length },
    { id: 'referrals', label: 'Referrals', icon: '', count: referrals.length },
    { id: 'rx-history', label: 'Rx History', icon: '', count: prescriptions.length },
    { id: 'documents', label: 'Documents', icon: '', count: documents.length },
    { id: 'photos', label: 'Photos', icon: '', count: photos.length },
    { id: 'tasks', label: 'Tasks', icon: '✓', count: tasks.filter(t => t.status !== 'completed').length },
    { id: 'scribe', label: 'AI Scribe', icon: '✨' },
    { id: 'timeline', label: 'Timeline', icon: '', count: encounters.length + appointments.length + documents.length + photos.length + referrals.length },
  ].filter((tab) => canViewClinicalPatientData || !CLINICAL_PATIENT_TABS.has(tab.id));

  return (
    <div className="patient-detail-page">
      {/* Patient Banner */}
      <PatientBanner
        patient={patient}
        onStartEncounter={handleStartEncounter}
      />

      {/* AI Scribe Panel */}
      <div style={{ padding: '16px 24px', maxWidth: '1200px', margin: '0 auto' }}>
        <ScribePanel
          ref={scribeContainerRef}
          patientId={patient.id}
          patientName={`${patient.firstName} ${patient.lastName}`}
          encounterId={encounterIdParam}
          providerId={providerIdParam}
          autoStart={autoStartScribe}
          highlighted={highlightScribe}
          showScheduleBadge={scribeParam}
          onRecordingComplete={(recordingId) => {
            console.log('Recording complete:', recordingId);
            navigate(`/ambient-scribe?recordingId=${recordingId}&auto=1`);
          }}
        />
      </div>

      {/* Action Bar */}
      <div className="ema-action-bar">
        <button type="button" className="ema-action-btn" onClick={() => navigate('/patients')}>
          <span className="icon">←</span>
          Back to Patients
        </button>
        <button type="button" className="ema-action-btn" onClick={handleStartEncounter}>
          <span className="icon">+</span>
          New Encounter
        </button>
        <button type="button" className="ema-action-btn" onClick={() => navigate('/schedule')}>
          <span className="icon"></span>
          Schedule Appt
        </button>
        <button type="button" className="ema-action-btn" onClick={openAddRecallModal}>
          <span className="icon">+</span>
          Add to Recall
        </button>
        <button type="button" className="ema-action-btn" onClick={() => setShowFaceSheet(true)}>
          <span className="icon"></span>
          Face Sheet
        </button>
        <button type="button" className="ema-action-btn">
          <span className="icon"></span>
          Prescriptions
        </button>
        <button type="button" className="ema-action-btn" onClick={loadPatientData}>
          <span className="icon"></span>
          Refresh
        </button>
        {hasRole(session?.user, 'admin') && (
          <button
            type="button"
            className="ema-action-btn"
            onClick={() => setShowDeleteConfirm(true)}
            style={{ marginLeft: 'auto', color: '#dc2626' }}
          >
            <span className="icon">🗑</span>
            Delete Patient
          </button>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Patient"
      >
        <div style={{ padding: '1rem' }}>
          <p style={{ marginBottom: '1rem', color: '#374151' }}>
            Are you sure you want to delete <strong>{patient.firstName} {patient.lastName}</strong>?
          </p>
          <p style={{ marginBottom: '1.5rem', color: '#dc2626', fontSize: '0.875rem' }}>
            This will permanently delete all associated records including appointments, encounters, documents, photos, and tasks. This action cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="ema-action-btn"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ema-action-btn"
              onClick={handleDeletePatient}
              disabled={isDeleting}
              style={{ background: '#dc2626', color: 'white' }}
            >
              {isDeleting ? 'Deleting...' : 'Delete Patient'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showAddRecallModal}
        onClose={() => setShowAddRecallModal(false)}
        title="Add Recall / Surveillance"
        size="lg"
      >
        <div style={{ display: 'grid', gap: '1rem', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          <div>
            <div style={{ fontWeight: 700, color: '#111827' }}>
              {patient.firstName} {patient.lastName}
            </div>
            <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
              Add this patient to a recall program such as melanoma surveillance or annual skin check.
            </div>
          </div>

          <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.875rem', color: '#374151' }}>
            Recall program
            <select
              value={recallForm.campaignId}
              onChange={(event) => handleRecallCampaignChange(event.target.value)}
              disabled={isLoadingRecallCampaigns || isCreatingRecall}
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '8px' }}
            >
              {recallCampaigns.length === 0 && <option value="">Manual recall</option>}
              {recallCampaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name} ({campaign.intervalMonths || 0} mo)
                </option>
              ))}
            </select>
          </label>

          {!recallForm.campaignId && (
            <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.875rem', color: '#374151' }}>
              Manual recall type
              <input
                type="text"
                value={recallForm.recallType}
                onChange={(event) => setRecallForm((current) => ({ ...current, recallType: event.target.value }))}
                disabled={isCreatingRecall}
                placeholder="e.g., Annual Skin Check"
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '8px' }}
              />
            </label>
          )}

          <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.875rem', color: '#374151' }}>
            Due date
            <input
              type="date"
              value={recallForm.dueDate}
              onChange={(event) => setRecallForm((current) => ({ ...current, dueDate: event.target.value }))}
              disabled={isCreatingRecall}
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '8px' }}
            />
          </label>

          <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.875rem', color: '#374151' }}>
            Staff / doctor note
            <textarea
              value={recallForm.notes}
              onChange={(event) => setRecallForm((current) => ({ ...current, notes: event.target.value }))}
              disabled={isCreatingRecall}
              placeholder="Example: melanoma surveillance, schedule full-body skin exam before next quarter."
              rows={4}
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '8px', resize: 'vertical' }}
            />
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap', width: '100%' }}>
            <button type="button" className="ema-action-btn" onClick={() => setShowAddRecallModal(false)} disabled={isCreatingRecall}>
              Cancel
            </button>
            <button
              type="button"
              className="ema-action-btn"
              onClick={handleCreateRecall}
              disabled={isCreatingRecall || isLoadingRecallCampaigns || !recallForm.dueDate}
              style={{ background: '#0369a1', color: '#ffffff' }}
            >
              {isCreatingRecall ? 'Adding...' : 'Add Recall'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Section Header */}
      <div className="ema-section-header">
        Patient Chart - {patient.lastName}, {patient.firstName}
      </div>

      {/* Tabs - EMA Style */}
      <div style={{
        display: 'flex',
        background: '#f3f4f6',
        borderBottom: '1px solid #e5e7eb',
        overflowX: 'auto',
        overflowY: 'hidden',
        whiteSpace: 'nowrap',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'thin',
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.75rem 1.5rem',
              background: activeTab === tab.id ? '#ffffff' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '3px solid #0369a1' : '3px solid transparent',
              color: activeTab === tab.id ? '#0369a1' : '#6b7280',
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              whiteSpace: 'nowrap',
              flex: '0 0 auto',
            }}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span style={{
                background: activeTab === tab.id ? '#0369a1' : '#9ca3af',
                color: '#ffffff',
                padding: '0.125rem 0.5rem',
                borderRadius: '10px',
                fontSize: '0.75rem',
                fontWeight: 600
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ background: '#ffffff', padding: '1.5rem' }}>
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Body Diagram Section - Enhanced Anatomical View */}
            {canViewClinicalPatientData && (
              <div style={{ gridColumn: '1 / -1' }}>
                <PatientBodyDiagram
                  patientId={patientId || ''}
                  editable={true}
                />
              </div>
            )}

            {/* Right Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Vitals Summary */}
              <div>
                <div className="ema-section-header" style={{ marginBottom: '0.75rem' }}>
                  Latest Vitals
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '0.75rem'
                }}>
                  {[
                    {
                      label: 'BP',
                      value: latestVital?.bpSystolic && latestVital?.bpDiastolic
                        ? `${latestVital.bpSystolic}/${latestVital.bpDiastolic}`
                        : '--',
                      unit: 'mmHg',
                    },
                    { label: 'Pulse', value: latestVital?.pulse ?? '--', unit: 'bpm' },
                    {
                      label: 'Temp',
                      value: latestVital?.tempC ?? '--',
                      unit: '°C',
                    },
                    { label: 'Weight', value: latestVital?.weightKg ?? '--', unit: 'kg' },
                  ].map((vital) => (
                    <div
                      key={vital.label}
                      style={{
                        background: '#f0fdf4',
                        border: '1px solid #10b981',
                        borderRadius: '8px',
                        padding: '0.75rem',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 500 }}>
                        {vital.label}
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#047857' }}>
                        {vital.value}
                      </div>
                      <div style={{ fontSize: '0.625rem', color: '#6b7280' }}>
                        {vital.unit}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                  Last recorded: {latestVital
                    ? new Date(latestVital.recordedAt || latestVital.createdAt).toLocaleDateString()
                    : 'No vitals on file'}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('clinical-trends')}
                  style={{
                    marginTop: '0.5rem',
                    border: 'none',
                    background: 'transparent',
                    color: '#0369a1',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  View full vitals history
                </button>
              </div>

              {canViewClinicalPatientData && (
                <ClinicalSummaryPreview
                  diagnoses={confirmedDiagnoses}
                  recalls={activeRecalls}
                  onOpenSummary={() => setActiveTab('clinical-summary')}
                  onOpenEncounter={handleViewEncounter}
                />
              )}

              <AccessNeedsPreview
                patient={patient}
                onOpen={() => setActiveTab('accessibility')}
                onEdit={() => setEditAccessibilityOpen(true)}
              />

              {/* Recent Activity */}
              <div>
                <div className="ema-section-header" style={{ marginBottom: '0.75rem' }}>
                  Recent Activity
                </div>
                {encounters.length === 0 && appointments.length === 0 ? (
                  <div style={{
                    background: '#f9fafb',
                    border: '1px dashed #d1d5db',
                    borderRadius: '8px',
                    padding: '2rem',
                    textAlign: 'center',
                    color: '#6b7280'
                  }}>
                    No recent activity
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {encounters.slice(0, 3).map((enc) => (
                      <div
                        key={enc.id}
                        onClick={() => handleViewEncounter(enc.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.75rem',
                          background: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          cursor: 'pointer'
                        }}
                      >
                        <span style={{ fontSize: '1.25rem' }}></span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                            Encounter - {enc.status}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {new Date(enc.createdAt).toLocaleDateString()}
                          </div>
                          {enc.chiefComplaint && (
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              CC: {enc.chiefComplaint}
                            </div>
                          )}
                        </div>
                        <span style={{ color: '#9ca3af' }}>→</span>
                      </div>
                    ))}
                    {displayAppointments.slice(0, 3).map((appt) => (
                      <div
                        key={appt.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.75rem',
                          background: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}
                      >
                        <span style={{ fontSize: '1.25rem' }}></span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                            {appt.appointmentTypeName || 'Appointment'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {new Date(appt.scheduledStart).toLocaleString()}
                          </div>
                        </div>
                        <span className={`ema-status ${appt.status === 'completed' ? 'established' : 'pending'}`}>
                          {appt.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Scribe Snapshot */}
              {patient && canViewClinicalPatientData && (
                <div>
                  <div className="ema-section-header" style={{ marginBottom: '0.75rem' }}>
                    AI Scribe Snapshot
                  </div>
                  <PatientScribeSnapshot
                    patientId={patient.id}
                    patientName={`${patient.firstName} ${patient.lastName}`}
                    onViewArchive={() => setActiveTab('scribe')}
                  />
                </div>
              )}

              {/* Active Medications */}
              {patientId && canViewClinicalPatientData && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <ActiveMedicationsCard
                    patientId={patientId}
                    onAddMedication={() => setActiveTab('rx-history')}
                    onViewAll={() => setActiveTab('rx-history')}
                    maxDisplay={5}
                    showRefillAlerts={true}
                  />
                </div>
              )}

              {/* Quick Actions */}
              <div>
                <div className="ema-section-header" style={{ marginBottom: '0.75rem' }}>
                  Quick Actions
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  {[
                    { label: 'New Encounter', icon: '', onClick: handleStartEncounter },
                  { label: 'Schedule', icon: '', onClick: () => navigate('/schedule') },
                  { label: 'Add Recall', icon: '+', onClick: openAddRecallModal },
                  { label: 'Message', icon: '', onClick: () => navigate('/mail') },
                  { label: 'Documents', icon: '', onClick: () => setActiveTab('documents') },
                  { label: 'Photos', icon: '', onClick: () => setActiveTab('photos') },
                  { label: 'Orders', icon: '', onClick: () => setActiveTab('orders') },
                  { label: 'Insurance', icon: '', onClick: () => setActiveTab('insurance') },
                  { label: 'Access Needs', icon: '', onClick: () => setActiveTab('accessibility') },
                ].map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={action.onClick}
                      style={{
                        padding: '0.75rem',
                        background: '#f3f4f6',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      <span style={{ fontSize: '1.25rem' }}>{action.icon}</span>
                      <span style={{ fontSize: '0.75rem', color: '#374151' }}>{action.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'encounters' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div className="ema-section-header">Encounters</div>
              <button type="button" className="ema-action-btn" onClick={handleStartEncounter}>
                <span className="icon">+</span>
                New Encounter
              </button>
            </div>

            {encounters.length === 0 ? (
              <div style={{
                background: '#f9fafb',
                border: '1px dashed #d1d5db',
                borderRadius: '8px',
                padding: '3rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
                <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No encounters yet</h3>
                <p style={{ color: '#6b7280', margin: '0 0 1rem' }}>Start the first encounter for this patient</p>
                <button type="button" className="ema-action-btn" onClick={handleStartEncounter}>
                  Start Encounter
                </button>
              </div>
            ) : (
              <table className="ema-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Chief Complaint</th>
                    <th>Provider</th>
                    <th>Status</th>
                    <th>Assessment/Plan</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {encounters.map((enc) => (
                    <tr key={enc.id} onClick={() => handleViewEncounter(enc.id)} style={{ cursor: 'pointer' }}>
                      <td>{new Date(enc.createdAt).toLocaleDateString()}</td>
                      <td>{enc.chiefComplaint || '—'}</td>
                      <td>{(enc as any).providerName || 'Unknown'}</td>
                      <td>
                        <span className={`ema-status ${enc.status === 'signed' ? 'established' : enc.status === 'draft' ? 'pending' : 'inactive'}`}>
                          {enc.status}
                        </span>
                      </td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {enc.assessmentPlan || '—'}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewEncounter(enc.id);
                          }}
                          style={{
                            padding: '0.25rem 0.75rem',
                            background: '#0369a1',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'appointments' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div className="ema-section-header">Appointments</div>
              <button type="button" className="ema-action-btn" onClick={() => navigate('/schedule')}>
                <span className="icon">+</span>
                Schedule
              </button>
            </div>

            {appointments.length === 0 ? (
              <div style={{
                background: '#f9fafb',
                border: '1px dashed #d1d5db',
                borderRadius: '8px',
                padding: '3rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
                <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No appointments</h3>
                <p style={{ color: '#6b7280', margin: 0 }}>Schedule an appointment for this patient</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {displayAppointments.map((appt) => (
                  <div
                    key={appt.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      padding: '1rem',
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  >
                    <div style={{
                      background: '#0369a1',
                      color: '#ffffff',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      textAlign: 'center',
                      minWidth: '60px'
                    }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                        {new Date(appt.scheduledStart).getDate()}
                      </div>
                      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>
                        {new Date(appt.scheduledStart).toLocaleDateString(undefined, { month: 'short' })}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{appt.appointmentTypeName}</div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        {new Date(appt.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {appt.providerName}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{appt.locationName}</div>
                    </div>
                    <span className={`ema-status ${appt.status === 'completed' ? 'established' : appt.status === 'scheduled' ? 'pending' : 'inactive'}`}>
                      {appt.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <OrdersTab orders={orders} onOpenOrders={() => navigate('/orders')} />
        )}

        {activeTab === 'referrals' && (
          <ReferralsTab
            referrals={referrals}
            onOpenReferrals={() => navigate(`/referrals?patientId=${patient.id}`)}
          />
        )}

        {activeTab === 'demographics' && (
          <DemographicsTab patient={patient} onEdit={() => setEditDemographicsOpen(true)} />
        )}

        {activeTab === 'accessibility' && (
          <AccessibilityTab patient={patient} onEdit={() => setEditAccessibilityOpen(true)} />
        )}

        {activeTab === 'insurance' && (
          <InsuranceTab patient={patient} onEdit={() => setEditInsuranceOpen(true)} />
        )}

        {activeTab === 'account' && patientId && (
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            <PatientCostEstimatePanel patientId={patientId} />
            <PatientBalanceSummary patientId={patientId} />
          </div>
        )}

        {activeTab === 'medical-history' && (
          <MedicalHistoryTab
            patient={patient}
            diagnoses={clinicalSummary.diagnoses}
            canManageDiagnoses={canManageDiagnoses}
            diagnosisReviewActionId={diagnosisReviewActionId}
            onConfirmDiagnosis={handleConfirmAiDiagnosis}
            onRejectDiagnosis={handleRejectAiDiagnosis}
            onMakeDiagnosisPrimary={handleMakeDiagnosisPrimary}
            onEditAllergy={() => setEditAllergyOpen(true)}
            onEditMedication={() => setEditMedicationOpen(true)}
            onEditProblem={() => setEditProblemOpen(true)}
          />
        )}

        {activeTab === 'clinical-summary' && (
          <ClinicalSummaryTab
            diagnoses={clinicalSummary.diagnoses}
            recalls={clinicalSummary.recalls}
            canManageDiagnoses={canManageDiagnoses}
            diagnosisReviewActionId={diagnosisReviewActionId}
            onConfirmDiagnosis={handleConfirmAiDiagnosis}
            onRejectDiagnosis={handleRejectAiDiagnosis}
            onMakeDiagnosisPrimary={handleMakeDiagnosisPrimary}
            onOpenEncounter={handleViewEncounter}
            onOpenRecalls={() => navigate('/recalls')}
            onAddRecall={openAddRecallModal}
          />
        )}

        {activeTab === 'clinical-trends' && (
          <ClinicalTrendsTab patientId={patientId!} />
        )}

        {activeTab === 'documents' && (
          <DocumentsTab
            documents={documents}
            onUpload={() => alert('Document upload feature coming soon')}
          />
        )}

        {activeTab === 'photos' && (
          <PhotosTab
            photos={photos}
            onUpload={() => setShowPhotoUploadModal(true)}
            onOpenWorkbench={() => navigate(`/photos?patientId=${patientId}`)}
            onView={(photo) => setSelectedPhoto(photo)}
            getPhotoUrl={getPhotoDisplayUrl}
          />
        )}

        {activeTab === 'rx-history' && (
          <RxHistoryTab
            prescriptions={prescriptions}
            onRefresh={loadPatientData}
          />
        )}

        {activeTab === 'tasks' && patientId && (
          <TasksTab patientId={patientId} />
        )}

        {activeTab === 'scribe' && patient && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <ClinicalCopilotPanel
              patientId={patient.id}
              encounterId={encounterIdParam || undefined}
              title="Patient AI Assistant"
              compact
              showOpenFullButton
              onVisitSummarySaved={() => setScribeArchiveRefreshKey((current) => current + 1)}
            />
            <PatientScribeSummaries
              patientId={patient.id}
              patientName={`${patient.firstName} ${patient.lastName}`}
              refreshSignal={scribeArchiveRefreshKey}
            />
          </div>
        )}

        {activeTab === 'timeline' && (
          <TimelineTab
            patient={patient}
            encounters={encounters}
            appointments={appointments}
            documents={documents}
            photos={photos}
            referrals={referrals}
            getPhotoUrl={getPhotoDisplayUrl}
          />
        )}
      </div>

      <Modal
        isOpen={showFaceSheet}
        onClose={() => setShowFaceSheet(false)}
        title="Face Sheet"
        size="lg"
      >
        {patient ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>{patient.lastName}, {patient.firstName}</h3>
                <p style={{ margin: '0.25rem 0', color: '#4b5563' }}>{formatDateOnly(patient.dob) || 'DOB: N/A'} • {patient.sex || 'Sex: N/A'}</p>
                <p style={{ margin: '0.25rem 0', color: '#6b7280' }}>{formatPhoneDisplay(patient.phone) || 'No phone'} • {patient.email || 'No email'}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn secondary" onClick={() => setShowFaceSheet(false)}>Close</button>
                <button type="button" className="btn primary" onClick={handlePrintFaceSheet}>Print</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0' }}>Address</h4>
                <p style={{ margin: 0 }}>{patient.address || 'N/A'}</p>
                <p style={{ margin: 0 }}>{[patient.city, patient.state, patient.zip].filter(Boolean).join(', ')}</p>
              </div>
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0' }}>Insurance</h4>
                {patient.insurance ? (
                  typeof patient.insurance === 'object' && patient.insurance.planName ? (
                    <>
                      <p style={{ margin: 0 }}>{patient.insurance.planName}</p>
                      <p style={{ margin: 0 }}>Member: {patient.insurance.memberId}</p>
                      {patient.insurance.groupNumber && <p style={{ margin: 0 }}>Group: {patient.insurance.groupNumber}</p>}
                    </>
                  ) : (
                    <p style={{ margin: 0 }}>{typeof patient.insurance === 'string' ? patient.insurance : 'On file'}</p>
                  )
                ) : (
                  <p style={{ margin: 0 }}>No insurance on file</p>
                )}
              </div>
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0' }}>Allergies</h4>
                <p style={{ margin: 0 }}>
                  {Array.isArray(patient.allergies) && patient.allergies.length > 0
                    ? patient.allergies.join(', ')
                    : typeof patient.allergies === 'string' && patient.allergies.trim() !== ''
                      ? patient.allergies
                      : 'None reported'}
                </p>
              </div>
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0' }}>Medications</h4>
                <p style={{ margin: 0 }}>{patient.medications || 'None on file'}</p>
              </div>
            </div>
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>Next Appointment</h4>
              {nextAppointment ? (
                <p style={{ margin: 0 }}>
                  {new Date(nextAppointment.scheduledStart).toLocaleString()} with {nextAppointment.providerName || 'Provider'}
                  {nextAppointment.locationName ? ` @ ${nextAppointment.locationName}` : ''}
                </p>
              ) : (
                <p style={{ margin: 0 }}>No upcoming appointment.</p>
              )}
            </div>
          </div>
        ) : (
          <p>Loading...</p>
        )}
      </Modal>

      {/* Edit Modals */}
      <EditDemographicsModal
        isOpen={editDemographicsOpen}
        onClose={() => setEditDemographicsOpen(false)}
        patient={patient}
        onSave={loadPatientData}
        session={session}
      />

      <EditAccessibilityModal
        isOpen={editAccessibilityOpen}
        onClose={() => setEditAccessibilityOpen(false)}
        patient={patient}
        onSave={loadPatientData}
        session={session}
      />

      <EditInsuranceModal
        isOpen={editInsuranceOpen}
        onClose={() => setEditInsuranceOpen(false)}
        patient={patient}
        onSave={loadPatientData}
        session={session}
      />

      <EditAllergyModal
        isOpen={editAllergyOpen}
        onClose={() => setEditAllergyOpen(false)}
        patient={patient}
        onSave={loadPatientData}
        session={session}
      />

      <EditMedicationModal
        isOpen={editMedicationOpen}
        onClose={() => setEditMedicationOpen(false)}
        patient={patient}
        onSave={loadPatientData}
        session={session}
      />

      <EditProblemModal
        isOpen={editProblemOpen}
        onClose={() => setEditProblemOpen(false)}
        patient={patient}
        onSave={loadPatientData}
        session={session}
      />

      <Modal
        isOpen={showPhotoUploadModal}
        onClose={() => {
          setShowPhotoUploadModal(false);
          resetPhotoUploadForm();
        }}
        size="lg"
        title="Upload Clinical Photo"
      >
        <div className="modal-form">
          <div className="form-row">
            <div className="form-field">
              <label>Body Location</label>
              <select
                value={photoUploadForm.bodyLocation}
                onChange={(e) =>
                  setPhotoUploadForm((prev) => ({ ...prev, bodyLocation: e.target.value }))
                }
              >
                <option value="">Select location...</option>
                {PHOTO_BODY_LOCATIONS.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Type</label>
              <select
                value={photoUploadForm.photoType}
                onChange={(e) =>
                  setPhotoUploadForm((prev) => ({
                    ...prev,
                    photoType: e.target.value as PhotoType,
                  }))
                }
              >
                {PHOTO_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-field">
            <label>Description</label>
            <textarea
              value={photoUploadForm.description}
              onChange={(e) =>
                setPhotoUploadForm((prev) => ({ ...prev, description: e.target.value }))
              }
              rows={3}
              placeholder="Optional note about this photo..."
            />
          </div>

          <div className="form-field">
            <label>Photo *</label>
            <input
              ref={photoFileInputRef}
              type="file"
              accept="image/*"
              onChange={handleProfilePhotoFileSelect}
              style={{ display: 'none' }}
            />
            <input
              ref={photoCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleProfilePhotoFileSelect}
              style={{ display: 'none' }}
            />

            {photoUploadForm.previewUrl ? (
              <div className="upload-preview">
                <img src={photoUploadForm.previewUrl} alt="Photo preview" />
                <button
                  type="button"
                  className="btn-sm btn-secondary"
                  onClick={clearSelectedPhotoUploadFile}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div
                className={`upload-dropzone ${isPhotoUploadDragOver ? 'drag-active' : ''}`}
                onClick={() => photoFileInputRef.current?.click()}
                onDragEnter={() => setIsPhotoUploadDragOver(true)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsPhotoUploadDragOver(true);
                }}
                onDragLeave={() => setIsPhotoUploadDragOver(false)}
                onDrop={handleProfilePhotoDrop}
              >
                <div className="upload-icon"></div>
                <p>Drag and drop an image here</p>
                <p className="muted tiny">JPG, PNG, or HEIC supported</p>
                <div className="upload-dropzone-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      photoFileInputRef.current?.click();
                    }}
                  >
                    Browse Files
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      photoCameraInputRef.current?.click();
                    }}
                  >
                    Take Photo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowPhotoUploadModal(false);
              resetPhotoUploadForm();
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleProfilePhotoUpload}
            disabled={isUploadingPhoto || !photoUploadForm.file}
          >
            {isUploadingPhoto ? 'Uploading...' : 'Upload Photo'}
          </button>
        </div>
      </Modal>

      {selectedPhoto && (
        <Modal isOpen={true} onClose={() => setSelectedPhoto(null)} size="lg" title="Photo Viewer">
          <div style={{ textAlign: 'center' }}>
            <img
              src={getPhotoDisplayUrl(selectedPhoto)}
              alt={selectedPhoto.description || 'Patient photo'}
              style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
            />
            {selectedPhoto.description && (
              <p style={{ marginTop: '1rem', color: '#6b7280' }}>{selectedPhoto.description}</p>
            )}
            {selectedPhoto.bodyLocation && (
              <p style={{ marginTop: '0.5rem', color: '#9ca3af', fontSize: '0.875rem' }}>
                Location: {selectedPhoto.bodyLocation}
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// Demographics Tab Component
function DemographicsTab({ patient, onEdit }: { patient: Patient; onEdit: () => void }) {
  const calculateAge = (dob?: string) => {
    return calculateAgeFromDateOnly(dob) ?? 'N/A';
  };

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="ema-section-header">Patient Demographics</div>
        <button type="button" className="ema-action-btn" onClick={onEdit}>
          <span className="icon"></span>
          Edit Demographics
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Personal Information */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Personal Information
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <InfoRow label="Full Name" value={`${patient.firstName} ${patient.lastName}`} />
            <InfoRow label="Date of Birth" value={formatDateOnly(patient.dob) || 'Not provided'} />
            <InfoRow label="Age" value={calculateAge(patient.dob)} />
            <InfoRow label="Sex" value={(patient as any).sex || 'Not specified'} />
            <InfoRow label="MRN" value={patient.mrn || 'Not assigned'} />
            <InfoRow label="Billing Account" value={patient.accountNumber || 'Not assigned'} />
            <InfoRow label="SSN" value={(patient as any).ssn || 'Not provided'} />
          </div>
        </div>

        {/* Contact Information */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Contact Information
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <InfoRow label="Phone" value={formatPhoneDisplay(patient.phone) || 'Not provided'} />
            <InfoRow label="Email" value={patient.email || 'Not provided'} />
            <InfoRow
              label="Address"
              value={patient.address ? `${patient.address}${patient.city ? `, ${patient.city}` : ''}${patient.state ? `, ${patient.state}` : ''}${patient.zip ? ` ${patient.zip}` : ''}` : 'Not provided'}
            />
          </div>
        </div>

        {/* Emergency Contact */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Emergency Contact
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <InfoRow label="Name" value={(patient as any).emergencyContactName || 'Not provided'} />
            <InfoRow label="Relationship" value={(patient as any).emergencyContactRelationship || 'Not provided'} />
            <InfoRow label="Phone" value={formatPhoneDisplay((patient as any).emergencyContactPhone) || 'Not provided'} />
          </div>
        </div>

        {/* Preferred Pharmacy */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Preferred Pharmacy
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <InfoRow label="Pharmacy Name" value={(patient as any).pharmacyName || 'Not specified'} />
            <InfoRow label="Phone" value={(patient as any).pharmacyPhone || 'Not provided'} />
            <InfoRow label="Address" value={(patient as any).pharmacyAddress || 'Not provided'} />
            {(patient as any).pharmacyNcpdp && (
              <InfoRow label="NCPDP" value={(patient as any).pharmacyNcpdp} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PatientEligibilitySummary({
  patientId,
  carrier,
  payerId,
  memberId,
  groupNumber,
}: {
  patientId: string;
  carrier?: string;
  payerId?: string;
  memberId?: string;
  groupNumber?: string;
}) {
  const { session } = useAuth();
  const [latest, setLatest] = useState<any | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLatest = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetchEligibilityHistory(session.tenantId, session.accessToken, patientId);
      const history = res?.history || [];
      setLatest(history[0] || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load eligibility history');
    }
  }, [session, patientId]);

  useEffect(() => {
    setError(null);
    loadLatest();
  }, [loadLatest]);

  const handleVerify = async () => {
    if (!session) return;
    setIsRefreshing(true);
    setError(null);
    try {
      await verifyPatientEligibility(session.tenantId, session.accessToken, patientId);
      await loadLatest();
    } catch (err: any) {
      setError(err.message || 'Failed to verify eligibility');
    } finally {
      setIsRefreshing(false);
    }
  };

  const deductibleTotal = latest?.deductible_total_cents;
  const deductibleRemaining = latest?.deductible_remaining_cents;
  const oopMax = latest?.oop_max_cents;
  const oopRemaining = latest?.oop_remaining_cents;

  const eligibility = {
    status: latest?.verification_status,
    verifiedAt: latest?.verified_at,
    payerName: latest?.payer_name || carrier,
    memberId: latest?.member_id || memberId,
    groupNumber,
    copayAmount: latest?.copay_specialist_cents,
    deductibleTotal,
    deductibleRemaining,
    deductibleMet: deductibleTotal != null && deductibleRemaining != null
      ? deductibleTotal - deductibleRemaining
      : undefined,
    oopMax,
    oopRemaining,
    oopMet: oopMax != null && oopRemaining != null
      ? oopMax - oopRemaining
      : undefined,
    priorAuthRequired: latest?.prior_auth_required,
    hasIssues: latest?.has_issues,
    issueNotes: latest?.issue_notes,
  };

  return (
    <div>
      <CoverageSummaryCard
        eligibility={eligibility}
        onRefresh={handleVerify}
        isRefreshing={isRefreshing}
      />
      {error && (
        <div style={{ marginTop: '0.75rem', color: '#b91c1c', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}
      <InsuranceLookupPanel
        patientId={patientId}
        payerId={latest?.payer_id || payerId || ''}
        payerName={latest?.payer_name || carrier || ''}
        memberId={latest?.member_id || memberId || ''}
        onChecked={loadLatest}
      />
    </div>
  );
}

// Insurance Tab Component
function InsuranceTab({ patient, onEdit }: { patient: Patient; onEdit: () => void }) {
  // Use patient's direct insurance fields, falling back to insuranceDetails for legacy data
  const insuranceDetails = (patient as any).insuranceDetails || {};
  const rawInsurance = (patient as any).insurance;
  const insuranceObject = typeof rawInsurance === 'object' && rawInsurance !== null ? rawInsurance : null;
  const insuranceData = {
    primaryCarrier: insuranceObject?.planName || rawInsurance || insuranceDetails.primaryCarrier,
    primaryPayerId: (patient as any).insurancePayerId || insuranceObject?.payerId || insuranceDetails.primaryPayerId,
    primaryPolicyNumber: (patient as any).insuranceId || insuranceObject?.memberId || insuranceDetails.primaryPolicyNumber,
    primaryGroupNumber: (patient as any).insuranceGroupNumber || insuranceObject?.groupNumber || insuranceDetails.primaryGroupNumber,
    primarySubscriberName: insuranceDetails.primarySubscriberName,
    primaryRelationship: insuranceDetails.primaryRelationship,
    primaryEffectiveDate: insuranceDetails.primaryEffectiveDate,
    secondaryCarrier: insuranceDetails.secondaryCarrier,
    secondaryPolicyNumber: insuranceDetails.secondaryPolicyNumber,
    secondaryGroupNumber: insuranceDetails.secondaryGroupNumber,
    secondarySubscriberName: insuranceDetails.secondarySubscriberName,
    secondaryRelationship: insuranceDetails.secondaryRelationship,
    secondaryEffectiveDate: insuranceDetails.secondaryEffectiveDate,
    cardFrontUrl: insuranceDetails.cardFrontUrl,
    cardBackUrl: insuranceDetails.cardBackUrl,
  };

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="ema-section-header">Insurance Information</div>
        <button type="button" className="ema-action-btn" onClick={onEdit}>
          <span className="icon"></span>
          Edit Insurance
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Primary Insurance */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ background: '#0369a1', color: '#fff', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>PRIMARY</span>
            Primary Insurance
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            <InfoRow label="Insurance Carrier" value={insuranceData.primaryCarrier || 'Not provided'} />
            <InfoRow label="Payer ID" value={insuranceData.primaryPayerId || 'Not provided'} />
            <InfoRow label="Policy Number" value={insuranceData.primaryPolicyNumber || 'Not provided'} />
            <InfoRow label="Group Number" value={insuranceData.primaryGroupNumber || 'Not provided'} />
            <InfoRow label="Subscriber Name" value={insuranceData.primarySubscriberName || patient.firstName + ' ' + patient.lastName} />
            <InfoRow label="Relationship" value={insuranceData.primaryRelationship || 'Self'} />
            <InfoRow label="Effective Date" value={insuranceData.primaryEffectiveDate ? new Date(insuranceData.primaryEffectiveDate).toLocaleDateString() : 'Not provided'} />
          </div>
        </div>

        {/* Secondary Insurance */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ background: '#6b7280', color: '#fff', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>SECONDARY</span>
            Secondary Insurance
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            <InfoRow label="Insurance Carrier" value={insuranceData.secondaryCarrier || 'Not provided'} />
            <InfoRow label="Policy Number" value={insuranceData.secondaryPolicyNumber || 'Not provided'} />
            <InfoRow label="Group Number" value={insuranceData.secondaryGroupNumber || 'Not provided'} />
            <InfoRow label="Subscriber Name" value={insuranceData.secondarySubscriberName || 'Not provided'} />
            <InfoRow label="Relationship" value={insuranceData.secondaryRelationship || 'Not provided'} />
            <InfoRow label="Effective Date" value={insuranceData.secondaryEffectiveDate ? new Date(insuranceData.secondaryEffectiveDate).toLocaleDateString() : 'Not provided'} />
          </div>
        </div>

        {/* Insurance Card Images */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Insurance Card Images
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem', color: '#6b7280' }}>Front</p>
              {insuranceData.cardFrontUrl ? (
                <img src={insuranceData.cardFrontUrl} alt="Insurance card front" style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '4px' }} />
              ) : (
                <div style={{ padding: '3rem', background: '#fff', border: '1px dashed #d1d5db', borderRadius: '4px', textAlign: 'center', color: '#9ca3af' }}>
                  No image uploaded
                </div>
              )}
            </div>
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem', color: '#6b7280' }}>Back</p>
              {insuranceData.cardBackUrl ? (
                <img src={insuranceData.cardBackUrl} alt="Insurance card back" style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '4px' }} />
              ) : (
                <div style={{ padding: '3rem', background: '#fff', border: '1px dashed #d1d5db', borderRadius: '4px', textAlign: 'center', color: '#9ca3af' }}>
                  No image uploaded
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Eligibility & Coverage */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Eligibility & Coverage
          </h3>
          <PatientEligibilitySummary
            patientId={patient.id}
            carrier={insuranceData.primaryCarrier || undefined}
            payerId={insuranceData.primaryPayerId || undefined}
            memberId={insuranceData.primaryPolicyNumber || undefined}
            groupNumber={insuranceData.primaryGroupNumber || undefined}
          />
        </div>

        <PatientCostEstimatePanel patientId={patient.id} />
      </div>
    </div>
  );
}

// Orders Tab Component
function OrdersTab({ orders, onOpenOrders }: { orders: Order[]; onOpenOrders: () => void }) {
  const getStatusClass = (status?: string) => {
    if (!status) return 'pending';
    if (['completed', 'closed'].includes(status)) return 'established';
    if (['received', 'reviewed'].includes(status)) return 'active';
    if (['pending', 'draft', 'open', 'sent', 'in-progress', 'ordered'].includes(status)) return 'pending';
    return 'inactive';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div className="ema-section-header">Orders</div>
        <button type="button" className="ema-action-btn" onClick={onOpenOrders}>
          <span className="icon"></span>
          Open Orders
        </button>
      </div>

      {orders.length === 0 ? (
        <div style={{
          background: '#f9fafb',
          border: '1px dashed #d1d5db',
          borderRadius: '8px',
          padding: '3rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No orders yet</h3>
          <p style={{ color: '#6b7280', margin: '0 0 1rem' }}>Create an order to link it to this patient</p>
          <button type="button" className="ema-action-btn" onClick={onOpenOrders}>
            Create Order
          </button>
        </div>
      ) : (
        <table className="ema-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Details</th>
              <th>Result</th>
              <th>Flag</th>
              <th>Provider</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '—'}</td>
                <td>{order.type ? order.type.toUpperCase() : '—'}</td>
                <td>
                  <span className={`ema-status ${getStatusClass(order.status)}`}>
                    {order.status || 'pending'}
                  </span>
                </td>
                <td>{order.priority || 'normal'}</td>
                <td style={{ maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {order.details || '—'}
                </td>
                <td style={{ maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={order.results || undefined}>
                  {order.results ? (
                    <span>
                      {order.results}
                      {order.resultsProcessed ? (
                        <small style={{ display: 'block', color: '#6b7280', marginTop: '0.15rem' }}>
                          Processed {new Date(order.resultsProcessed).toLocaleDateString()}
                        </small>
                      ) : null}
                    </span>
                  ) : '—'}
                </td>
                <td>
                  <ResultFlagBadge flag={order.resultFlag || 'none'} size="sm" />
                </td>
                <td>{order.providerName || 'Unknown'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function getReferralParty(referral: Referral): string {
  if (referral.direction === 'incoming') {
    return referral.referringProvider || referral.referringOrganization || (referral as any).referringProviderName || 'External provider';
  }
  return referral.referredToProvider || referral.referredToOrganization || 'External provider';
}

function ReferralsTab({
  referrals,
  onOpenReferrals,
}: {
  referrals: Referral[];
  onOpenReferrals: () => void;
}) {
  const getStatusClass = (status?: string) => {
    if (!status) return 'pending';
    if (['completed', 'report_sent'].includes(status)) return 'established';
    if (['declined', 'cancelled'].includes(status)) return 'inactive';
    return 'pending';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div className="ema-section-header">Referrals</div>
        <button type="button" className="ema-action-btn" onClick={onOpenReferrals}>
          <span className="icon">+</span>
          Open Referrals
        </button>
      </div>

      {referrals.length === 0 ? (
        <div style={{
          background: '#f9fafb',
          border: '1px dashed #d1d5db',
          borderRadius: '8px',
          padding: '3rem',
          textAlign: 'center'
        }}>
          <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No referrals yet</h3>
          <p style={{ color: '#6b7280', margin: '0 0 1rem' }}>
            Incoming and outgoing referral activity will appear here in the patient chart.
          </p>
          <button type="button" className="ema-action-btn" onClick={onOpenReferrals}>
            Add Referral
          </button>
        </div>
      ) : (
        <table className="ema-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Direction</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Provider / Organization</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {referrals.map((referral) => (
              <tr key={referral.id}>
                <td>{referral.createdAt ? new Date(referral.createdAt).toLocaleDateString() : '—'}</td>
                <td style={{ textTransform: 'capitalize' }}>{referral.direction}</td>
                <td>
                  <span className={`ema-status ${getStatusClass(referral.status)}`}>
                    {String(referral.status || 'new').replace(/_/g, ' ')}
                  </span>
                </td>
                <td>{String(referral.priority || 'routine').toUpperCase()}</td>
                <td>{getReferralParty(referral)}</td>
                <td style={{ maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {referral.reason || referral.notes || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Medical History Tab Component
function MedicalHistoryTab({
  patient,
  diagnoses,
  canManageDiagnoses,
  diagnosisReviewActionId,
  onConfirmDiagnosis,
  onRejectDiagnosis,
  onMakeDiagnosisPrimary,
  onEditAllergy,
  onEditMedication,
  onEditProblem
}: {
  patient: Patient;
  diagnoses: PatientDiagnosisSummary[];
  canManageDiagnoses: boolean;
  diagnosisReviewActionId: string | null;
  onConfirmDiagnosis: (diagnosis: PatientDiagnosisSummary) => void;
  onRejectDiagnosis: (diagnosis: PatientDiagnosisSummary) => void;
  onMakeDiagnosisPrimary: (diagnosis: PatientDiagnosisSummary) => void;
  onEditAllergy: () => void;
  onEditMedication: () => void;
  onEditProblem: () => void;
}) {
  const allergies = getMedicalHistoryAllergies(patient);

  const medications = getMedicalHistoryMedications(patient);

  const problems = (patient as any).problemsList || [];
  const aiSuggestedDiagnoses = diagnoses.filter(isAiSuggestedDiagnosis);
  const confirmedDiagnoses = diagnoses.filter((diagnosis) => !isAiSuggestedDiagnosis(diagnosis));
  const hasProblemData = problems.length > 0 || confirmedDiagnoses.length > 0 || aiSuggestedDiagnoses.length > 0;

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div className="ema-section-header" style={{ marginBottom: '1.5rem' }}>Medical History</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Allergies */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
              Allergies
            </h3>
            <button type="button" className="ema-action-btn" onClick={onEditAllergy}>
              <span className="icon">+</span>
              Add Allergy
            </button>
          </div>
          {allergies.length === 0 ? (
            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No known allergies</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
	              {allergies.map((allergy: any, idx: number) => (
	                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
	                  <span style={{
	                    padding: '0.25rem 0.5rem',
	                    borderRadius: '4px',
	                    fontSize: '0.75rem',
	                    fontWeight: 600,
	                    background: allergy.severity === 'severe' ? '#fef2f2' : allergy.severity === 'moderate' ? '#fef3c7' : '#f0fdf4',
	                    color: allergy.severity === 'severe' ? '#dc2626' : allergy.severity === 'moderate' ? '#f59e0b' : '#10b981',
	                    textTransform: 'uppercase'
	                  }}>
	                    {allergy.severity || 'unknown'}
	                  </span>
	                  <div style={{ flex: 1 }}>
	                    <div style={{ fontWeight: 500 }}>{allergy.name}</div>
	                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Reaction: {allergy.reaction || 'Unknown'}</div>
	                  </div>
	                </div>
	              ))}
            </div>
          )}
        </div>

        {/* Current Medications */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
              Current Medications
            </h3>
            <button type="button" className="ema-action-btn" onClick={onEditMedication}>
              <span className="icon">+</span>
              Add Medication
            </button>
          </div>
          {medications.length === 0 ? (
            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No current medications</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
	              {medications.map((med: any, idx: number) => (
	                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
	                  <span style={{ fontSize: '1.25rem' }}></span>
	                  <div style={{ flex: 1 }}>
	                    <div style={{ fontWeight: 500 }}>{med.name}</div>
	                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
	                      {(med.dosage || 'Directions not on file')} • Prescribed: {formatHistoryDate(med.prescribedDate)}
	                    </div>
	                  </div>
	                </div>
	              ))}
            </div>
          )}
        </div>

        {/* Problem List */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
              Problem List
            </h3>
            <button type="button" className="ema-action-btn" onClick={onEditProblem}>
              <span className="icon">+</span>
              Add Problem
            </button>
          </div>
          {!hasProblemData ? (
            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No problems recorded</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {problems.map((problem: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 500 }}>{problem.name}</span>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>({problem.icdCode})</span>
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      Onset: {new Date(problem.onsetDate).toLocaleDateString()}
                    </div>
                  </div>
                  <span style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: problem.status === 'Active' ? '#dbeafe' : '#f3f4f6',
                    color: problem.status === 'Active' ? '#0369a1' : '#6b7280'
                  }}>
                    {problem.status}
                  </span>
                </div>
              ))}
              {confirmedDiagnoses.map((diagnosis) => (
                <div key={diagnosis.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 500 }}>{diagnosis.description || 'Diagnosis'}</span>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>({diagnosis.icd10Code})</span>
                      {diagnosis.isPrimary && (
                        <span style={{
                          background: '#dbeafe',
                          color: '#1d4ed8',
                          borderRadius: '999px',
                          padding: '0.125rem 0.5rem',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}>
                          Primary
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      Encounter diagnosis{diagnosis.encounterDate ? ` - ${new Date(diagnosis.encounterDate).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                  <span style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: '#fef3c7',
                    color: '#92400e'
                  }}>
                    Dx
                  </span>
                </div>
              ))}
              {aiSuggestedDiagnoses.length > 0 && (
                <div style={{
                  marginTop: '0.5rem',
                  border: '1px solid #fde68a',
                  background: '#fffbeb',
                  borderRadius: '8px',
                  padding: '0.9rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 800, color: '#92400e' }}>AI Diagnosis Review</div>
                      <div style={{ fontSize: '0.8rem', color: '#92400e', marginTop: '0.2rem' }}>
                        Suggested encounter diagnoses must be confirmed before they are treated as final.
                      </div>
                    </div>
                    <span style={{
                      borderRadius: '999px',
                      background: '#fef3c7',
                      color: '#92400e',
                      padding: '0.25rem 0.55rem',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                    }}>
                      {aiSuggestedDiagnoses.length} pending
                    </span>
                  </div>
                  {aiSuggestedDiagnoses.map((diagnosis) => {
                    const isBusy = diagnosisReviewActionId === diagnosis.id;
                    return (
                      <div key={diagnosis.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.75rem', alignItems: 'center', padding: '0.75rem', background: '#ffffff', border: '1px solid #fde68a', borderRadius: '8px' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: '#111827' }}>{cleanAiDiagnosisDescription(diagnosis.description) || 'Diagnosis'}</span>
                            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>({diagnosis.icd10Code})</span>
                            {diagnosis.isPrimary && (
                              <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: '999px', padding: '0.125rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                Primary
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '0.25rem' }}>
                            Encounter diagnosis{diagnosis.encounterDate ? ` - ${new Date(diagnosis.encounterDate).toLocaleDateString()}` : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {!diagnosis.isPrimary && (
                            <button type="button" className="ema-action-btn" disabled={!canManageDiagnoses || isBusy} onClick={() => onMakeDiagnosisPrimary(diagnosis)}>
                              Primary
                            </button>
                          )}
                          <button type="button" className="ema-action-btn" disabled={!canManageDiagnoses || isBusy} onClick={() => onConfirmDiagnosis(diagnosis)}>
                            Confirm
                          </button>
                          <button type="button" className="ema-action-btn" disabled={!canManageDiagnoses || isBusy} onClick={() => onRejectDiagnosis(diagnosis)}>
                            Reject
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Past Medical History */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Past Medical History
          </h3>
          <p style={{ color: '#6b7280', margin: 0 }}>{(patient as any).pastMedicalHistory || 'No significant past medical history recorded'}</p>
        </div>

        {/* Family History */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Family History
          </h3>
          <p style={{ color: '#6b7280', margin: 0 }}>{(patient as any).familyHistory || 'No family history recorded'}</p>
        </div>

        {/* Social History */}
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Social History
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            <InfoRow label="Smoking Status" value={(patient as any).smokingStatus || 'Not assessed'} />
            <InfoRow label="Alcohol Use" value={(patient as any).alcoholUse || 'Not assessed'} />
            <InfoRow label="Exercise" value={(patient as any).exerciseFrequency || 'Not assessed'} />
          </div>
        </div>
      </div>
    </div>
  );
}

function isActiveRecallStatus(status?: string) {
  return ['pending', 'contacted', 'scheduled'].includes(String(status || '').toLowerCase());
}

function formatClinicalDate(value?: string | null) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString();
}

function recallStatusStyle(status?: string) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed') {
    return { background: '#dcfce7', color: '#166534' };
  }
  if (normalized === 'scheduled') {
    return { background: '#dbeafe', color: '#1d4ed8' };
  }
  if (normalized === 'dismissed') {
    return { background: '#f3f4f6', color: '#6b7280' };
  }
  if (normalized === 'contacted') {
    return { background: '#fef3c7', color: '#92400e' };
  }
  return { background: '#fee2e2', color: '#991b1b' };
}

function ClinicalSummaryPreview({
  diagnoses,
  recalls,
  onOpenSummary,
  onOpenEncounter,
}: {
  diagnoses: PatientDiagnosisSummary[];
  recalls: PatientRecallSummary[];
  onOpenSummary: () => void;
  onOpenEncounter: (encounterId: string) => void;
}) {
  const primaryDiagnosis = diagnoses[0];
  const nextRecall = recalls[0];

  return (
    <div>
      <div className="ema-section-header" style={{ marginBottom: '0.75rem' }}>
        Diagnoses & Recalls
      </div>
      <div style={{
        background: diagnoses.length || recalls.length ? '#f8fafc' : '#f9fafb',
        border: diagnoses.length || recalls.length ? '1px solid #bae6fd' : '1px dashed #d1d5db',
        borderRadius: '8px',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}>
        {!primaryDiagnosis && !nextRecall ? (
          <div style={{ color: '#6b7280', fontStyle: 'italic' }}>
            No diagnoses or recalls on file.
          </div>
        ) : (
          <>
            {primaryDiagnosis && (
              <button
                type="button"
                onClick={() => onOpenEncounter(primaryDiagnosis.encounterId)}
                style={{
                  textAlign: 'left',
                  border: '1px solid #e5e7eb',
                  background: '#ffffff',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 700, textTransform: 'uppercase' }}>
                  Active diagnosis
                </div>
                <div style={{ fontWeight: 700, color: '#111827', marginTop: '0.25rem' }}>
                  {primaryDiagnosis.description || 'Diagnosis'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  {primaryDiagnosis.icd10Code} {primaryDiagnosis.chiefComplaint ? `- ${primaryDiagnosis.chiefComplaint}` : ''}
                </div>
              </button>
            )}
            {nextRecall && (
              <div style={{
                border: '1px solid #e5e7eb',
                background: '#ffffff',
                borderRadius: '8px',
                padding: '0.75rem',
              }}>
                <div style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 700, textTransform: 'uppercase' }}>
                  Active recall
                </div>
                <div style={{ fontWeight: 700, color: '#111827', marginTop: '0.25rem' }}>
                  {nextRecall.recallType || nextRecall.campaignName || 'Recall'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Due {formatClinicalDate(nextRecall.dueDate || nextRecall.recallDate)}
                </div>
                {nextRecall.doctorNotes && (
                  <div style={{ fontSize: '0.8rem', color: '#374151', marginTop: '0.5rem' }}>
                    {nextRecall.doctorNotes}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        <button
          type="button"
          onClick={onOpenSummary}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#0369a1',
            fontWeight: 600,
            fontSize: '0.875rem',
            padding: 0,
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          View full diagnosis and recall plan
        </button>
      </div>
    </div>
  );
}

function ClinicalSummaryTab({
  diagnoses,
  recalls,
  canManageDiagnoses,
  diagnosisReviewActionId,
  onConfirmDiagnosis,
  onRejectDiagnosis,
  onMakeDiagnosisPrimary,
  onOpenEncounter,
  onOpenRecalls,
  onAddRecall,
}: {
  diagnoses: PatientDiagnosisSummary[];
  recalls: PatientRecallSummary[];
  canManageDiagnoses: boolean;
  diagnosisReviewActionId: string | null;
  onConfirmDiagnosis: (diagnosis: PatientDiagnosisSummary) => void;
  onRejectDiagnosis: (diagnosis: PatientDiagnosisSummary) => void;
  onMakeDiagnosisPrimary: (diagnosis: PatientDiagnosisSummary) => void;
  onOpenEncounter: (encounterId: string) => void;
  onOpenRecalls: () => void;
  onAddRecall: () => void;
}) {
  const activeRecalls = recalls.filter((recall) => isActiveRecallStatus(recall.status));
  const aiSuggestedDiagnoses = diagnoses.filter(isAiSuggestedDiagnosis);
  const confirmedDiagnoses = diagnoses.filter((diagnosis) => !isAiSuggestedDiagnosis(diagnosis));

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem' }}>
        <div>
          <div className="ema-section-header" style={{ marginBottom: '0.25rem' }}>
            Diagnoses & Recalls
          </div>
          <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            Encounter diagnoses, melanoma surveillance recalls, and follow-up timing for this patient.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" className="ema-action-btn" onClick={onAddRecall}>
            Add Recall
          </button>
          <button type="button" className="ema-action-btn" onClick={onOpenRecalls}>
            Open Recall Worklist
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem' }}>
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#111827' }}>Diagnoses</h3>
            <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{confirmedDiagnoses.length} confirmed</span>
          </div>

          {aiSuggestedDiagnoses.length > 0 && (
            <div style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: '8px', padding: '0.85rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.65rem' }}>
                <div style={{ fontWeight: 800, color: '#92400e' }}>AI Diagnosis Review</div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#92400e' }}>{aiSuggestedDiagnoses.length} pending</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {aiSuggestedDiagnoses.map((diagnosis) => {
                  const isBusy = diagnosisReviewActionId === diagnosis.id;
                  return (
                    <div key={diagnosis.id} style={{ background: '#ffffff', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                        <button
                          type="button"
                          onClick={() => onOpenEncounter(diagnosis.encounterId)}
                          style={{ textAlign: 'left', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', flex: 1 }}
                        >
                          <div style={{ fontWeight: 800, color: '#111827' }}>
                            {cleanAiDiagnosisDescription(diagnosis.description) || 'Diagnosis'}
                          </div>
                          <div style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                            {diagnosis.icd10Code} {diagnosis.chiefComplaint ? `- ${diagnosis.chiefComplaint}` : ''}
                          </div>
                          <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                            {formatClinicalDate(diagnosis.encounterDate || diagnosis.createdAt)}
                            {diagnosis.providerName ? ` - ${diagnosis.providerName}` : ''}
                          </div>
                        </button>
                        {diagnosis.isPrimary && (
                          <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: '999px', padding: '0.25rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                            Primary
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                        {!diagnosis.isPrimary && (
                          <button type="button" className="ema-action-btn" disabled={!canManageDiagnoses || isBusy} onClick={() => onMakeDiagnosisPrimary(diagnosis)}>
                            Primary
                          </button>
                        )}
                        <button type="button" className="ema-action-btn" disabled={!canManageDiagnoses || isBusy} onClick={() => onConfirmDiagnosis(diagnosis)}>
                          Confirm
                        </button>
                        <button type="button" className="ema-action-btn" disabled={!canManageDiagnoses || isBusy} onClick={() => onRejectDiagnosis(diagnosis)}>
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {confirmedDiagnoses.length === 0 ? (
            <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No encounter diagnoses recorded.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {confirmedDiagnoses.map((diagnosis) => (
                <button
                  key={diagnosis.id}
                  type="button"
                  onClick={() => onOpenEncounter(diagnosis.encounterId)}
                  style={{
                    textAlign: 'left',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#111827' }}>
                        {diagnosis.description || 'Diagnosis'}
                      </div>
                      <div style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                        {diagnosis.icd10Code} {diagnosis.chiefComplaint ? `- ${diagnosis.chiefComplaint}` : ''}
                      </div>
                      <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        {formatClinicalDate(diagnosis.encounterDate || diagnosis.createdAt)}
                        {diagnosis.providerName ? ` - ${diagnosis.providerName}` : ''}
                      </div>
                    </div>
                    {diagnosis.isPrimary && (
                      <span style={{
                        background: '#dbeafe',
                        color: '#1d4ed8',
                        borderRadius: '999px',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}>
                        Primary
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#111827' }}>Recall & Follow-Up Plan</h3>
            <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{activeRecalls.length} active</span>
          </div>

          {recalls.length === 0 ? (
            <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No recalls or follow-ups recorded.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {recalls.map((recall) => {
                const statusStyle = recallStatusStyle(recall.status);
                return (
                  <div
                    key={recall.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '0.875rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#111827' }}>
                          {recall.recallType || recall.campaignName || 'Recall'}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                          Due {formatClinicalDate(recall.dueDate || recall.recallDate)}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                          Preferred contact: {recall.preferredContactMethod || recall.contactMethod || 'Not set'}
                        </div>
                      </div>
                      <span style={{
                        ...statusStyle,
                        borderRadius: '999px',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}>
                        {recall.status || 'pending'}
                      </span>
                    </div>
                    {(recall.doctorNotes || recall.notes) && (
                      <div style={{
                        color: '#374151',
                        fontSize: '0.875rem',
                        marginTop: '0.75rem',
                        paddingTop: '0.75rem',
                        borderTop: '1px solid #e5e7eb',
                      }}>
                        {recall.doctorNotes || recall.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Documents Tab Component
function DocumentsTab({
  documents,
  onUpload
}: {
  documents: Document[];
  onUpload: () => void;
}) {
  const { session } = useAuth();
  const { showError } = useToast();

  const openDocument = async (doc: Document) => {
    if (!doc.url) return;

    if (!doc.url.startsWith('/api/')) {
      window.open(doc.url, '_blank');
      return;
    }

    if (!session) {
      showError('Sign in again to view this document');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}${doc.url}`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
      });
      if (!response.ok) throw new Error('Failed to open document');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (error: any) {
      showError(error.message || 'Failed to open document');
    }
  };

  const downloadDocument = async (doc: Document) => {
    if (!doc.url) return;

    if (!doc.url.startsWith('/api/')) {
      const link = document.createElement('a');
      link.href = doc.url;
      link.download = doc.filename || doc.title || 'document';
      link.click();
      return;
    }

    if (!session) {
      showError('Sign in again to download this document');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}${doc.url}`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
      });
      if (!response.ok) throw new Error('Failed to download document');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.filename || doc.title || 'document';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      showError(error.message || 'Failed to download document');
    }
  };

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="ema-section-header">Documents</div>
        <button type="button" className="ema-action-btn" onClick={onUpload}>
          <span className="icon"></span>
          Upload Document
        </button>
      </div>

      {documents.length === 0 ? (
        <div style={{
          background: '#f9fafb',
          border: '1px dashed #d1d5db',
          borderRadius: '8px',
          padding: '3rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No documents</h3>
          <p style={{ color: '#6b7280', margin: '0 0 1rem' }}>Upload documents for this patient</p>
          <button type="button" className="ema-action-btn" onClick={onUpload}>
            Upload Document
          </button>
        </div>
      ) : (
        <table className="ema-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Category</th>
              <th>Date Uploaded</th>
              <th>Uploaded By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span></span>
                    <span>{doc.title}</span>
                  </div>
                </td>
                <td>{doc.category || 'General'}</td>
                <td>{new Date(doc.createdAt).toLocaleDateString()}</td>
                <td>{(doc as any).uploadedBy || 'System'}</td>
                <td>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => void openDocument(doc)}
                      style={{
                        padding: '0.25rem 0.75rem',
                        background: '#0369a1',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadDocument(doc)}
                      style={{
                        padding: '0.25rem 0.75rem',
                        background: '#6b7280',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      Download
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Photos Tab Component
function PhotosTab({
  photos,
  onUpload,
  onOpenWorkbench,
  onView,
  getPhotoUrl,
}: {
  photos: Photo[];
  onUpload: () => void;
  onOpenWorkbench: () => void;
  onView: (photo: Photo) => void;
  getPhotoUrl: (photo: Photo) => string;
}) {
  return (
    <div style={{ maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="ema-section-header">Clinical Photos</div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="ema-action-btn" onClick={onOpenWorkbench}>
            Imaging Workbench
          </button>
          <button type="button" className="ema-action-btn" onClick={onUpload}>
            <span className="icon"></span>
            Upload Photo
          </button>
        </div>
      </div>

      {photos.length === 0 ? (
        <div style={{
          background: '#f9fafb',
          border: '1px dashed #d1d5db',
          borderRadius: '8px',
          padding: '3rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No photos</h3>
          <p style={{ color: '#6b7280', margin: '0 0 1rem' }}>Upload clinical photos for this patient</p>
          <button type="button" className="ema-action-btn" onClick={onUpload}>
            Upload Photo
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
          {photos.map((photo) => (
            <div
              key={photo.id}
              onClick={() => onView(photo)}
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ aspectRatio: '1', overflow: 'hidden', background: '#f3f4f6' }}>
                <img
                  src={getPhotoUrl(photo)}
                  alt={photo.description || 'Patient photo'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <div style={{ padding: '0.75rem' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  {photo.bodyLocation || 'Unknown location'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {new Date(photo.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper component for displaying info rows
function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>{value}</div>
    </div>
  );
}

function AccessNeedsPreview({
  patient,
  onOpen,
  onEdit,
}: {
  patient: Patient;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const checklist = buildVisitPrepChecklist(patient.accessibilityProfile);
  const hasNeeds = hasAccessibilityNeeds(patient.accessibilityProfile);

  return (
    <div>
      <div className="ema-section-header" style={{ marginBottom: '0.75rem' }}>
        Access Needs
      </div>
      <div style={{
        background: hasNeeds ? '#eff6ff' : '#f9fafb',
        border: hasNeeds ? '1px solid #93c5fd' : '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '1rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
              {getAccessibilitySummary(patient.accessibilityProfile)}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#4b5563' }}>
              {hasNeeds ? 'Review before scheduling, check-in, rooming, and telehealth.' : 'Document communication, mobility, service animal, or extra-time needs when requested.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" className="ema-action-btn" onClick={onOpen}>Open</button>
            <button type="button" className="ema-action-btn" onClick={onEdit}>Edit</button>
          </div>
        </div>
        {checklist.length > 0 && (
          <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.2rem', color: '#1f2937', fontSize: '0.85rem' }}>
            {checklist.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AccessibilityChipList({ labels }: { labels: string[] }) {
  if (labels.length === 0) {
    return <span style={{ color: '#6b7280' }}>No access needs documented</span>;
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      {labels.map((label) => (
        <span
          key={label}
          style={{
            background: '#e0f2fe',
            color: '#075985',
            border: '1px solid #7dd3fc',
            borderRadius: '999px',
            padding: '0.25rem 0.65rem',
            fontSize: '0.78rem',
            fontWeight: 700,
          }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function AccessibilityTab({ patient, onEdit }: { patient: Patient; onEdit: () => void }) {
  const profile = normalizeAccessibilityProfile(patient.accessibilityProfile);
  const labels = getAccessibilityNeedLabels(profile);
  const checklist = buildVisitPrepChecklist(profile);

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
        <div>
          <div className="ema-section-header">Access Needs & Accommodations</div>
          <div style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.35rem' }}>
            Documentation for requested communication support, accessible room setup, mobility assistance, service animal access, and companion communication.
          </div>
        </div>
        <button type="button" className="ema-action-btn" onClick={onEdit}>
          Edit Access Needs
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '1.5rem' }}>
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Active Access Profile
          </h3>
          <AccessibilityChipList labels={labels} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem', marginTop: '1.25rem' }}>
            <InfoRow label="Interpreter" value={profile.interpreterNeeded ? profile.interpreterLanguage || 'Needed' : 'Not documented'} />
            <InfoRow label="Communication Support" value={(profile.communicationSupport || []).length > 0 ? profile.communicationSupport!.join(', ').replace(/_/g, ' ') : 'Not documented'} />
            <InfoRow label="Accessible Room" value={profile.accessibleRoomRequired ? 'Required' : 'Not documented'} />
            <InfoRow label="Mobility Assistance" value={profile.mobilityAssistance ? 'Requested' : 'Not documented'} />
            <InfoRow label="Service Animal" value={profile.serviceAnimal ? 'May accompany patient' : 'Not documented'} />
            <InfoRow label="Extra Time" value={profile.extendedVisit ? `${profile.extraVisitMinutes || 15} minutes` : 'Not documented'} />
          </div>
        </div>

        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Visit Prep Checklist
          </h3>
          {checklist.length === 0 ? (
            <p style={{ margin: 0, color: '#6b7280' }}>
              No visit-prep actions generated yet.
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#374151', display: 'grid', gap: '0.5rem' }}>
              {checklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Support Person / Companion
          </h3>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <InfoRow label="Name" value={profile.supportPerson?.name || 'Not documented'} />
            <InfoRow label="Relationship" value={profile.supportPerson?.relationship || 'Not documented'} />
            <InfoRow label="Phone" value={formatPhoneDisplay(profile.supportPerson?.phone) || 'Not documented'} />
            <InfoRow label="Companion Communication Needs" value={profile.supportPerson?.communicationNeeds || 'Not documented'} />
          </div>
        </div>

        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
            Notes & Review
          </h3>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <InfoRow label="Sensory Considerations" value={profile.sensoryConsiderations || 'Not documented'} />
            <InfoRow label="Staff Notes" value={profile.notes || 'Not documented'} />
            <InfoRow label="Last Reviewed" value={profile.lastReviewedAt ? new Date(profile.lastReviewedAt).toLocaleString() : 'Not reviewed'} />
            <InfoRow label="Reviewed By" value={profile.lastReviewedBy || 'Not documented'} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Edit Demographics Modal
function EditDemographicsModal({
  isOpen,
  onClose,
  patient,
  onSave,
  session
}: {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  onSave: () => void;
  session: any;
}) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dob: '',
    sex: '',
    ssn: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    emergencyContactName: '',
    emergencyContactRelationship: '',
    emergencyContactPhone: '',
    pharmacyId: '',
    pharmacyNcpdp: '',
    pharmacyName: '',
    pharmacyPhone: '',
    pharmacyAddress: '',
  });

  useEffect(() => {
    if (patient && isOpen) {
      setFormData({
        firstName: patient.firstName || '',
        lastName: patient.lastName || '',
        dob: patient.dob || '',
        sex: (patient as any).sex || '',
        ssn: (patient as any).ssn || '',
        phone: patient.phone || '',
        email: patient.email || '',
        address: patient.address || '',
        city: patient.city || '',
        state: patient.state || '',
        zip: patient.zip || '',
        emergencyContactName: (patient as any).emergencyContactName || '',
        emergencyContactRelationship: (patient as any).emergencyContactRelationship || '',
        emergencyContactPhone: (patient as any).emergencyContactPhone || '',
        pharmacyId: (patient as any).pharmacyId || '',
        pharmacyNcpdp: (patient as any).pharmacyNcpdp || '',
        pharmacyName: (patient as any).pharmacyName || '',
        pharmacyPhone: (patient as any).pharmacyPhone || '',
        pharmacyAddress: (patient as any).pharmacyAddress || '',
      });
    }
  }, [patient, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !patient) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/patients/${patient.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error('Failed to update patient');

      onSave();
      onClose();
    } catch (error) {
      console.error('Error updating patient:', error);
      alert('Failed to update patient demographics');
    }
  };

  const selectedPharmacy: Pharmacy | undefined = formData.pharmacyName
    ? {
        id: formData.pharmacyId || formData.pharmacyNcpdp || formData.pharmacyName,
        ncpdpId: formData.pharmacyNcpdp || undefined,
        name: formData.pharmacyName,
        phone: formData.pharmacyPhone || undefined,
        street: formData.pharmacyAddress || undefined,
        isPreferred: false,
        is24Hour: false,
        acceptsErx: true,
      }
    : undefined;

  const handlePharmacySelect = (pharmacy: Pharmacy) => {
    setFormData({
      ...formData,
      pharmacyId: pharmacy.id || '',
      pharmacyNcpdp: pharmacy.ncpdpId || pharmacy.ncpdp_id || '',
      pharmacyName: pharmacy.name || '',
      pharmacyPhone: pharmacy.phone || '',
      pharmacyAddress: formatPharmacyAddress(pharmacy),
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Demographics" size="lg">
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              First Name
            </label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Last Name
            </label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Date of Birth
            </label>
            <input
              type="date"
              value={formData.dob}
              onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Sex
            </label>
            <select
              value={formData.sex}
              onChange={(e) => setFormData({ ...formData, sex: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            >
              <option value="">Select...</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="O">Other</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Phone
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>
        </div>

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', marginTop: '1rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>Address</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Street Address
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  City
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  State
                </label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  maxLength={2}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  ZIP
                </label>
                <input
                  type="text"
                  value={formData.zip}
                  onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </div>
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', marginTop: '1rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>Preferred Pharmacy</h3>
          <PharmacySearch selectedPharmacy={selectedPharmacy} onSelect={handlePharmacySelect} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Pharmacy Name
              </label>
              <input
                type="text"
                value={formData.pharmacyName}
                onChange={(e) => setFormData({ ...formData, pharmacyName: e.target.value, pharmacyId: '', pharmacyNcpdp: '' })}
                placeholder="Search above or enter manually"
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Pharmacy Phone
              </label>
              <input
                type="tel"
                value={formData.pharmacyPhone}
                onChange={(e) => setFormData({ ...formData, pharmacyPhone: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Pharmacy Address
              </label>
              <input
                type="text"
                value={formData.pharmacyAddress}
                onChange={(e) => setFormData({ ...formData, pharmacyAddress: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </div>
            {formData.pharmacyNcpdp && (
              <div style={{ gridColumn: '1 / -1', fontSize: '0.75rem', color: '#047857', background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '0.5rem 0.75rem' }}>
                eRx directory match selected: NCPDP {formData.pharmacyNcpdp}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={{
              padding: '0.5rem 1rem',
              background: '#0369a1',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditAccessibilityModal({
  isOpen,
  onClose,
  patient,
  onSave,
  session,
}: {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  onSave: () => void;
  session: any;
}) {
  const [formData, setFormData] = useState<PatientAccessibilityProfile>({
    communicationSupport: [],
    accessibleEquipment: [],
    supportPerson: {},
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (patient && isOpen) {
      const profile = normalizeAccessibilityProfile(patient.accessibilityProfile);
      setFormData({
        ...profile,
        communicationSupport: profile.communicationSupport || [],
        accessibleEquipment: profile.accessibleEquipment || [],
        supportPerson: profile.supportPerson || {},
      });
    }
  }, [patient, isOpen]);

  const setBoolean = (field: keyof PatientAccessibilityProfile, value: boolean) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const setText = (field: keyof PatientAccessibilityProfile, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const toggleArrayValue = (
    field: 'communicationSupport' | 'accessibleEquipment',
    value: string,
  ) => {
    setFormData((current) => {
      const values = new Set(current[field] || []);
      if (values.has(value)) {
        values.delete(value);
      } else {
        values.add(value);
      }
      return { ...current, [field]: Array.from(values) };
    });
  };

  const updateSupportPerson = (field: keyof NonNullable<PatientAccessibilityProfile['supportPerson']>, value: string) => {
    setFormData((current) => ({
      ...current,
      supportPerson: {
        ...(current.supportPerson || {}),
        [field]: value,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !patient) return;

    setSaving(true);
    try {
      const profile = normalizeAccessibilityProfile({
        ...formData,
        extraVisitMinutes: Number(formData.extraVisitMinutes || 0) || undefined,
        lastReviewedAt: new Date().toISOString(),
        lastReviewedBy: session.user?.fullName || session.user?.email || 'Staff',
      });

      const res = await fetch(`${API_BASE_URL}/api/patients/${patient.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
        body: JSON.stringify({ accessibilityProfile: profile }),
      });

      if (!res.ok) throw new Error('Failed to update access needs');

      onSave();
      onClose();
    } catch (error) {
      console.error('Error updating access needs:', error);
      alert('Failed to update access needs');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Access Needs" size="lg">
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <section style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', color: '#374151' }}>
              Communication Support
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem 1rem' }}>
              {ACCESSIBILITY_COMMUNICATION_OPTIONS.map((option) => (
                <label key={option.value} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem', color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={(formData.communicationSupport || []).includes(option.value)}
                    onChange={() => toggleArrayValue('communicationSupport', option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.875rem', color: '#374151' }}>
                <span>
                  <input
                    type="checkbox"
                    checked={!!formData.interpreterNeeded}
                    onChange={(event) => setBoolean('interpreterNeeded', event.target.checked)}
                    style={{ marginRight: '0.5rem' }}
                  />
                  Interpreter needed
                </span>
                <input
                  type="text"
                  value={formData.interpreterLanguage || ''}
                  onChange={(event) => setText('interpreterLanguage', event.target.value)}
                  placeholder="Language or modality"
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.875rem', color: '#374151' }}>
                Sensory considerations
                <input
                  type="text"
                  value={formData.sensoryConsiderations || ''}
                  onChange={(event) => setText('sensoryConsiderations', event.target.value)}
                  placeholder="Example: low-stimulation room, dim lights"
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </label>
            </div>
          </section>

          <section style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', color: '#374151' }}>
              Mobility, Room, and Equipment
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem 1rem', marginBottom: '0.75rem' }}>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem', color: '#374151' }}>
                <input
                  type="checkbox"
                  checked={!!formData.mobilityAssistance}
                  onChange={(event) => setBoolean('mobilityAssistance', event.target.checked)}
                />
                Mobility or transfer assistance requested
              </label>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem', color: '#374151' }}>
                <input
                  type="checkbox"
                  checked={!!formData.accessibleRoomRequired}
                  onChange={(event) => setBoolean('accessibleRoomRequired', event.target.checked)}
                />
                Accessible room required
              </label>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem', color: '#374151' }}>
                <input
                  type="checkbox"
                  checked={!!formData.serviceAnimal}
                  onChange={(event) => setBoolean('serviceAnimal', event.target.checked)}
                />
                Service animal may accompany patient
              </label>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem', color: '#374151' }}>
                <input
                  type="checkbox"
                  checked={!!formData.extendedVisit}
                  onChange={(event) => setBoolean('extendedVisit', event.target.checked)}
                />
                Extended visit time
              </label>
            </div>
            <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.875rem', color: '#374151', maxWidth: '240px', marginBottom: '0.75rem' }}>
              Extra minutes
              <input
                type="number"
                min={0}
                max={240}
                value={formData.extraVisitMinutes || ''}
                onChange={(event) => setFormData((current) => ({ ...current, extraVisitMinutes: Number(event.target.value) || undefined }))}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem 1rem' }}>
              {ACCESSIBILITY_EQUIPMENT_OPTIONS.map((option) => (
                <label key={option.value} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem', color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={(formData.accessibleEquipment || []).includes(option.value)}
                    onChange={() => toggleArrayValue('accessibleEquipment', option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </section>

          <section style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', color: '#374151' }}>
              Support Person / Companion
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.875rem', color: '#374151' }}>
                Name
                <input
                  type="text"
                  value={formData.supportPerson?.name || ''}
                  onChange={(event) => updateSupportPerson('name', event.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.875rem', color: '#374151' }}>
                Relationship
                <input
                  type="text"
                  value={formData.supportPerson?.relationship || ''}
                  onChange={(event) => updateSupportPerson('relationship', event.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.875rem', color: '#374151' }}>
                Phone
                <input
                  type="tel"
                  value={formData.supportPerson?.phone || ''}
                  onChange={(event) => updateSupportPerson('phone', event.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.875rem', color: '#374151' }}>
                Companion communication needs
                <input
                  type="text"
                  value={formData.supportPerson?.communicationNeeds || ''}
                  onChange={(event) => updateSupportPerson('communicationNeeds', event.target.value)}
                  placeholder="Example: large print, interpreter"
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </label>
            </div>
          </section>

          <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.875rem', color: '#374151' }}>
            Staff notes
            <textarea
              value={formData.notes || ''}
              onChange={(event) => setText('notes', event.target.value)}
              rows={3}
              placeholder="Document patient-requested accommodation details, staff prep notes, or review context."
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '4px', resize: 'vertical' }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button type="button" className="ema-action-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            className="ema-action-btn"
            disabled={saving}
            style={{ background: '#0369a1', color: '#fff' }}
          >
            {saving ? 'Saving...' : 'Save Access Needs'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Edit Insurance Modal (Stub)
function EditInsuranceModal({ isOpen, onClose }: any) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Insurance" size="lg">
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Insurance editing form coming soon...</p>
      <button
        type="button"
        onClick={onClose}
        style={{
          padding: '0.5rem 1rem',
          background: '#f3f4f6',
          border: '1px solid #d1d5db',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Close
      </button>
    </Modal>
  );
}

// Edit Allergy Modal (Stub)
function EditAllergyModal({ isOpen, onClose }: any) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Allergy" size="md">
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Allergy form coming soon...</p>
      <button
        type="button"
        onClick={onClose}
        style={{
          padding: '0.5rem 1rem',
          background: '#f3f4f6',
          border: '1px solid #d1d5db',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Close
      </button>
    </Modal>
  );
}

// Edit Medication Modal (Stub)
function EditMedicationModal({ isOpen, onClose }: any) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Medication" size="md">
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Medication form coming soon...</p>
      <button
        type="button"
        onClick={onClose}
        style={{
          padding: '0.5rem 1rem',
          background: '#f3f4f6',
          border: '1px solid #d1d5db',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Close
      </button>
    </Modal>
  );
}

// Edit Problem Modal (Stub)
function EditProblemModal({ isOpen, onClose }: any) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Problem" size="md">
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Problem form coming soon...</p>
      <button
        type="button"
        onClick={onClose}
        style={{
          padding: '0.5rem 1rem',
          background: '#f3f4f6',
          border: '1px solid #d1d5db',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Close
      </button>
    </Modal>
  );
}

// Timeline Tab Component
interface TimelineEvent {
  id: string;
  type: 'encounter' | 'appointment' | 'document' | 'photo' | 'referral';
  date: string;
  title: string;
  description: string;
  status?: string;
  icon: string;
  iconColor: string;
  data: Encounter | Appointment | Document | Photo | Referral;
}

function TimelineTab({
  patient,
  encounters,
  appointments,
  documents,
  photos,
  referrals,
  getPhotoUrl,
}: {
  patient: Patient;
  encounters: Encounter[];
  appointments: Appointment[];
  documents: Document[];
  photos: Photo[];
  referrals: Referral[];
  getPhotoUrl: (photo: Photo) => string;
}) {
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(
    new Set(['encounter', 'appointment', 'document', 'photo', 'referral'])
  );

  // Build timeline events from all data sources
  const allEvents: TimelineEvent[] = [
    ...encounters.map((enc): TimelineEvent => ({
      id: `enc-${enc.id}`,
      type: 'encounter',
      date: enc.createdAt,
      title: 'Encounter',
      description: enc.chiefComplaint || 'No chief complaint recorded',
      status: enc.status,
      icon: '🏥',
      iconColor: '#0369a1',
      data: enc,
    })),
    ...appointments.map((appt): TimelineEvent => ({
      id: `appt-${appt.id}`,
      type: 'appointment',
      date: appt.scheduledStart,
      title: appt.appointmentTypeName || 'Appointment',
      description: `${appt.providerName || 'Provider'}${appt.locationName ? ` at ${appt.locationName}` : ''}`,
      status: appt.status,
      icon: '📅',
      iconColor: '#059669',
      data: appt,
    })),
    ...documents.map((doc): TimelineEvent => ({
      id: `doc-${doc.id}`,
      type: 'document',
      date: doc.createdAt,
      title: 'Document Uploaded',
      description: doc.title,
      status: doc.category || 'General',
      icon: '📄',
      iconColor: '#7c3aed',
      data: doc,
    })),
    ...referrals.map((referral): TimelineEvent => ({
      id: `referral-${referral.id}`,
      type: 'referral',
      date: referral.createdAt || referral.updatedAt || new Date().toISOString(),
      title: referral.direction === 'incoming' ? 'Incoming Referral' : 'Outgoing Referral',
      description: referral.reason || referral.notes || getReferralParty(referral),
      status: referral.status,
      icon: '↔',
      iconColor: '#0f766e',
      data: referral,
    })),
    ...photos.map((photo): TimelineEvent => ({
      id: `photo-${photo.id}`,
      type: 'photo',
      date: photo.createdAt,
      title: 'Photo Uploaded',
      description: photo.description || photo.bodyLocation || 'Clinical photo',
      icon: '📷',
      iconColor: '#dc2626',
      data: photo,
    })),
  ];

  // Sort by date (newest first)
  const sortedEvents = allEvents
    .filter((event) => selectedFilters.has(event.type))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const toggleFilter = (filterType: string) => {
    const newFilters = new Set(selectedFilters);
    if (newFilters.has(filterType)) {
      newFilters.delete(filterType);
    } else {
      newFilters.add(filterType);
    }
    setSelectedFilters(newFilters);
  };

  const getStatusBadgeStyle = (status?: string) => {
    if (!status) return { background: '#f3f4f6', color: '#6b7280' };

    const statusLower = status.toLowerCase();
    if (statusLower === 'signed' || statusLower === 'completed') {
      return { background: '#d1fae5', color: '#065f46' };
    }
    if (statusLower === 'draft' || statusLower === 'scheduled' || statusLower === 'pending') {
      return { background: '#dbeafe', color: '#1e40af' };
    }
    if (statusLower === 'cancelled' || statusLower === 'inactive') {
      return { background: '#fee2e2', color: '#991b1b' };
    }
    return { background: '#f3f4f6', color: '#6b7280' };
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayDiff = Math.round(
      (startOfDay(date).getTime() - startOfDay(now).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (dayDiff === 0) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    if (dayDiff > 0) {
      if (dayDiff === 1) {
        return `Tomorrow at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      if (dayDiff < 7) {
        return `In ${dayDiff} days`;
      }
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }

    if (dayDiff === -1) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (dayDiff > -7) {
      return `${Math.abs(dayDiff)} days ago`;
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const filterButtons = [
    { type: 'encounter', label: 'Encounters', icon: '🏥', color: '#0369a1', count: encounters.length },
    { type: 'appointment', label: 'Appointments', icon: '📅', color: '#059669', count: appointments.length },
    { type: 'document', label: 'Documents', icon: '📄', color: '#7c3aed', count: documents.length },
    { type: 'referral', label: 'Referrals', icon: '↔', color: '#0f766e', count: referrals.length },
    { type: 'photo', label: 'Photos', icon: '📷', color: '#dc2626', count: photos.length },
  ];

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div className="ema-section-header" style={{ marginBottom: '1.5rem' }}>
        Patient Timeline
      </div>

      {/* Filter Controls */}
      <div style={{
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem' }}>
          Filter by Type
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {filterButtons.map((filter) => (
            <button
              key={filter.type}
              type="button"
              onClick={() => toggleFilter(filter.type)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                background: selectedFilters.has(filter.type) ? filter.color : '#ffffff',
                color: selectedFilters.has(filter.type) ? '#ffffff' : '#374151',
                border: `2px solid ${filter.color}`,
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
                transition: 'all 0.2s'
              }}
            >
              <span>{filter.icon}</span>
              <span>{filter.label}</span>
              <span style={{
                background: selectedFilters.has(filter.type) ? 'rgba(255, 255, 255, 0.3)' : '#f3f4f6',
                color: selectedFilters.has(filter.type) ? '#ffffff' : '#6b7280',
                padding: '0.125rem 0.5rem',
                borderRadius: '10px',
                fontSize: '0.75rem',
                fontWeight: 600
              }}>
                {filter.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Timeline Events */}
      {sortedEvents.length === 0 ? (
        <div style={{
          background: '#f9fafb',
          border: '1px dashed #d1d5db',
          borderRadius: '8px',
          padding: '3rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No activity found</h3>
          <p style={{ color: '#6b7280', margin: 0 }}>
            {selectedFilters.size === 0
              ? 'Select at least one filter to view timeline events'
              : 'No events match the selected filters'}
          </p>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* Vertical timeline line */}
          <div style={{
            position: 'absolute',
            left: '24px',
            top: '0',
            bottom: '0',
            width: '2px',
            background: '#e5e7eb'
          }} />

          {/* Timeline events */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {sortedEvents.map((event, index) => (
              <div
                key={event.id}
                style={{
                  display: 'flex',
                  gap: '1rem',
                  position: 'relative'
                }}
              >
                {/* Icon with colored circle */}
                <div style={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'flex-start',
                  paddingTop: '0.25rem'
                }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: event.iconColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    border: '4px solid #ffffff',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                  }}>
                    {event.icon}
                  </div>
                </div>

                {/* Event content card */}
                <div style={{
                  flex: 1,
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1rem',
                  transition: 'box-shadow 0.2s',
                  cursor: event.type === 'encounter' ? 'pointer' : 'default'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
                          {event.title}
                        </h3>
                        {event.status && (
                          <span style={{
                            ...getStatusBadgeStyle(event.status),
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            textTransform: 'capitalize'
                          }}>
                            {event.status}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                        {formatDate(event.date)}
                      </div>
                    </div>

                    {/* Type badge */}
                    <div style={{
                      padding: '0.25rem 0.5rem',
                      background: event.iconColor,
                      color: '#ffffff',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'capitalize'
                    }}>
                      {event.type}
                    </div>
                  </div>

                  <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
                    {event.description}
                  </p>

                  {/* Event-specific details */}
                  {event.type === 'encounter' && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', fontSize: '0.75rem' }}>
                        <div>
                          <span style={{ color: '#9ca3af' }}>Provider: </span>
                          <span style={{ color: '#374151', fontWeight: 500 }}>
                            {(event.data as any).providerName || 'Unknown'}
                          </span>
                        </div>
                        {(event.data as Encounter).assessmentPlan && (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <span style={{ color: '#9ca3af' }}>A&P: </span>
                            <span style={{ color: '#374151' }}>
                              {(event.data as Encounter).assessmentPlan}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {event.type === 'appointment' && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', fontSize: '0.75rem' }}>
                        <div>
                          <span style={{ color: '#9ca3af' }}>Time: </span>
                          <span style={{ color: '#374151', fontWeight: 500 }}>
                            {new Date((event.data as Appointment).scheduledStart).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: '#9ca3af' }}>Duration: </span>
                          <span style={{ color: '#374151', fontWeight: 500 }}>
                            {(event.data as Appointment).durationMinutes || 30} min
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {event.type === 'document' && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => window.open((event.data as Document).url, '_blank')}
                          style={{
                            padding: '0.375rem 0.75rem',
                            background: '#0369a1',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 500
                          }}
                        >
                          View Document
                        </button>
                      </div>
                    </div>
                  )}

                  {event.type === 'referral' && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', fontSize: '0.75rem' }}>
                        <div>
                          <span style={{ color: '#9ca3af' }}>Direction: </span>
                          <span style={{ color: '#374151', fontWeight: 500, textTransform: 'capitalize' }}>
                            {(event.data as Referral).direction}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: '#9ca3af' }}>Priority: </span>
                          <span style={{ color: '#374151', fontWeight: 500 }}>
                            {String((event.data as Referral).priority || 'routine').toUpperCase()}
                          </span>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <span style={{ color: '#9ca3af' }}>Provider / Organization: </span>
                          <span style={{ color: '#374151', fontWeight: 500 }}>
                            {getReferralParty(event.data as Referral)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {event.type === 'photo' && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <img
                          src={getPhotoUrl(event.data as Photo)}
                          alt={event.description}
                          style={{
                            width: '80px',
                            height: '80px',
                            objectFit: 'cover',
                            borderRadius: '4px',
                            border: '1px solid #e5e7eb'
                          }}
                        />
                        <div style={{ flex: 1, fontSize: '0.75rem' }}>
                          {(event.data as Photo).bodyLocation && (
                            <div style={{ marginBottom: '0.25rem' }}>
                              <span style={{ color: '#9ca3af' }}>Location: </span>
                              <span style={{ color: '#374151', fontWeight: 500 }}>
                                {(event.data as Photo).bodyLocation}
                              </span>
                            </div>
                          )}
                          <div>
                            <span style={{ color: '#9ca3af' }}>Uploaded by: </span>
                            <span style={{ color: '#374151', fontWeight: 500 }}>
                              {(event.data as any).uploadedBy || 'System'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div style={{
        marginTop: '2rem',
        padding: '1rem',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '8px'
      }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem' }}>
          Activity Summary
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          {filterButtons.map((filter) => (
            <div key={filter.type} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>{filter.icon}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600, color: filter.color }}>
                {filter.count}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'capitalize' }}>
                {filter.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
 
