import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal } from '../components/ui';
import { PatientBanner, TemplateSelector } from '../components/clinical';
import { PatientBodyDiagram, type BodyMarker } from '../components/body-diagram';
import { DiagnosisSearchModal, PerformedWorkModal, ProcedureSearchModal } from '../components/billing';
import { InventoryUsageList, InventoryUsageModal } from '../components/inventory';
import { EncounterPrescriptions } from '../components/prescriptions';
import { ScribePanel } from '../components/ScribePanel';
import { ClinicalCopilotPanel } from '../components/ClinicalCopilotPanel';
import {
  fetchPatients,
  fetchPatientClinicalSummary,
  fetchEncounters,
  createEncounter,
  updateEncounter,
  updateEncounterStatus,
  updateAppointmentStatus,
  checkOutFrontDeskAppointment,
  updatePatientFlowStatus,
  fetchVitals,
  createVitals,
  fetchOrders,
  createOrder,
  fetchDiagnosesByEncounter,
  createDiagnosis,
  updateDiagnosis,
  deleteDiagnosis,
  fetchChargesByEncounter,
  createCharge,
  deleteCharge,
  syncLiveEncounterCoding,
  generateAiNoteDraft,
  fetchNoteTemplates,
  fetchProviders,
  fetchEncounterAmbientNotes,
} from '../api';
import type { Patient, Encounter, Vitals, Order, EncounterDiagnosis, Charge, ICD10Code, CPTCode } from '../types';
import type { NoteTemplate, AINoteDraft, AmbientGeneratedNote, PatientDiagnosisSummary, LiveEncounterCodingResult } from '../api';
import type { PerformedWorkSubmission } from '../components/billing/PerformedWorkModal';
import { useAutosave } from '../hooks/useAutosave';
import { ScribeSummaryCard } from '../components/ScribeSummaryCard';
import { clearActiveEncounter, setActiveEncounter } from '../utils/activeEncounter';
import { isCosmeticProcedure } from '../utils/procedureCatalog';
import { cleanAiDiagnosisDescription, isAiSuggestedDiagnosis } from '../utils/diagnosisReview';
import {
  buildDiagnoses,
  buildSummaryText,
  buildSymptoms,
  buildTests
} from '../utils/scribeSummary';

type EncounterSection = 'note' | 'exam' | 'orders' | 'prescriptions' | 'billing';

interface VitalsFormData {
  heightCm: string;
  weightKg: string;
  bpSystolic: string;
  bpDiastolic: string;
  pulse: string;
  tempC: string;
}

const EMPTY_VITALS_FORM: VitalsFormData = {
  heightCm: '',
  weightKg: '',
  bpSystolic: '',
  bpDiastolic: '',
  pulse: '',
  tempC: '',
};

interface EncounterStartNavigationState {
  startedEncounterFrom?: 'schedule' | 'office_flow';
  undoAppointmentStatus?: string;
  appointmentTypeName?: string;
  returnPath?: string;
}

export function EncounterPage() {
  const { patientId, encounterId } = useParams<{ patientId: string; encounterId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const isNew = !encounterId || encounterId === 'new';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [endingAppointment, setEndingAppointment] = useState(false);
  const [cancellingStartedVisit, setCancellingStartedVisit] = useState(false);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [encounter, setEncounter] = useState<Partial<Encounter>>({
    status: 'draft',
    chiefComplaint: '',
    hpi: '',
    ros: '',
    exam: '',
    assessmentPlan: '',
  });
  const [vitals, setVitals] = useState<Vitals | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [diagnoses, setDiagnoses] = useState<EncounterDiagnosis[]>([]);
  const [patientDiagnosisHistory, setPatientDiagnosisHistory] = useState<PatientDiagnosisSummary[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [scribeNote, setScribeNote] = useState<AmbientGeneratedNote | null>(null);
  const [scribeNoteLoading, setScribeNoteLoading] = useState(false);
  const [liveCodingResult, setLiveCodingResult] = useState<LiveEncounterCodingResult | null>(null);
  const [liveCodingSyncing, setLiveCodingSyncing] = useState(false);
  const [liveCodingError, setLiveCodingError] = useState<string | null>(null);
  const [lastLiveCodingSyncedAt, setLastLiveCodingSyncedAt] = useState<string | null>(null);

  // Check if encounter is locked/read-only
  const isLocked = ['signed', 'locked', 'finalized', 'completed', 'closed'].includes(String(encounter.status || '').toLowerCase());
  const isClosedEncounter = isLocked;

  const [activeSection, setActiveSection] = useState<EncounterSection>('note');
  const [bodyDiagramMarkers, setBodyDiagramMarkers] = useState<BodyMarker[]>([]);

  // Modals
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [showDiagnosisModal, setShowDiagnosisModal] = useState(false);
  const [showProcedureModal, setShowProcedureModal] = useState(false);
  const [showPerformedWorkModal, setShowPerformedWorkModal] = useState(false);
  const [showInventoryUsageModal, setShowInventoryUsageModal] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showAiDraftModal, setShowAiDraftModal] = useState(false);
  const [aiDraftInput, setAiDraftInput] = useState({ chiefComplaint: '', briefNotes: '' });
  const [aiDraftResult, setAiDraftResult] = useState<AINoteDraft | null>(null);
  const [aiDraftError, setAiDraftError] = useState<string | null>(null);
  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const [aiTemplates, setAiTemplates] = useState<NoteTemplate[]>([]);
  const [aiTemplateId, setAiTemplateId] = useState<string>('');
  const [aiTemplateLoading, setAiTemplateLoading] = useState(false);
  const [aiTemplateError, setAiTemplateError] = useState<string | null>(null);

  // Providers for encounter creation
  const [providers, setProviders] = useState<{ id: string; fullName: string }[]>([]);
  const autoCreateEncounterRef = useRef(false);
  const lastLiveCodingPayloadRef = useRef('');
  const encounterStartState = (location.state || {}) as EncounterStartNavigationState;

  // Form data
  const [vitalsForm, setVitalsForm] = useState<VitalsFormData>(EMPTY_VITALS_FORM);

  const [orderForm, setOrderForm] = useState({
    type: 'lab',
    details: '',
  });

  // Load data
  const loadData = useCallback(async () => {
    if (!session || !patientId) return;

    setLoading(true);
    try {
      const [patientsRes, encountersRes, providersRes, clinicalSummaryRes] = await Promise.all([
        fetchPatients(session.tenantId, session.accessToken),
        fetchEncounters(session.tenantId, session.accessToken),
        fetchProviders(session.tenantId, session.accessToken),
        fetchPatientClinicalSummary(session.tenantId, session.accessToken, patientId).catch(() => ({ diagnoses: [], recalls: [] })),
      ]);

      const foundPatient = (patientsRes.patients || []).find(
        (p: Patient) => p.id === patientId
      );
      if (!foundPatient) {
        showError('Patient not found');
        navigate('/patients');
        return;
      }
      setPatient(foundPatient);
      setProviders(providersRes.providers || []);
      setPatientDiagnosisHistory(clinicalSummaryRes.diagnoses || []);

      if (!isNew && encounterId) {
        const foundEncounter = (encountersRes.encounters || []).find(
          (e: Encounter) => e.id === encounterId
        );
        if (foundEncounter) {
          setEncounter({
            ...foundEncounter,
            chiefComplaint: foundEncounter.chiefComplaint ?? '',
            hpi: foundEncounter.hpi ?? '',
            ros: foundEncounter.ros ?? '',
            exam: foundEncounter.exam ?? '',
            assessmentPlan: foundEncounter.assessmentPlan ?? '',
          });

          // Load vitals, orders, diagnoses, and charges for existing encounter
          const [vitalsRes, ordersRes, diagnosesRes, chargesRes] = await Promise.all([
            fetchVitals(session.tenantId, session.accessToken, patientId),
            fetchOrders(session.tenantId, session.accessToken),
            fetchDiagnosesByEncounter(session.tenantId, session.accessToken, encounterId),
            fetchChargesByEncounter(session.tenantId, session.accessToken, encounterId),
          ]);

          const encounterVitals = (vitalsRes.vitals || []).find(
            (vital: Vitals & { encounterId?: string | null }) => vital.encounterId === encounterId,
          ) || null;
          setVitals(encounterVitals);
          setVitalsForm(
            encounterVitals
              ? {
                  heightCm: encounterVitals.heightCm?.toString() || '',
                  weightKg: encounterVitals.weightKg?.toString() || '',
                  bpSystolic: encounterVitals.bpSystolic?.toString() || '',
                  bpDiastolic: encounterVitals.bpDiastolic?.toString() || '',
                  pulse: encounterVitals.pulse?.toString() || '',
                  tempC: encounterVitals.tempC?.toString() || '',
                }
              : EMPTY_VITALS_FORM,
          );

          setOrders(
            (ordersRes.orders || []).filter((o: Order) => o.encounterId === encounterId)
          );
          setDiagnoses(diagnosesRes.diagnoses || []);
          setCharges(chargesRes.charges || []);
        }
      }
    } catch (err: any) {
      showError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [session, patientId, encounterId, isNew, showError, navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!session || !encounterId || isNew) return;
    let cancelled = false;
    setScribeNoteLoading(true);

    fetchEncounterAmbientNotes(session.tenantId, session.accessToken, encounterId)
      .then((data) => {
        if (cancelled) return;
        const notes = data.notes || [];
        const approved = notes.filter((note) => note.reviewStatus === 'approved');
        const pool = approved.length ? approved : notes;
        const sorted = [...pool].sort((a, b) => {
          const aTime = new Date(a.completedAt || a.createdAt).getTime();
          const bTime = new Date(b.completedAt || b.createdAt).getTime();
          return bTime - aTime;
        });
        setScribeNote(sorted[0] || null);
      })
      .catch(() => {
        if (!cancelled) {
          setScribeNote(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setScribeNoteLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session, encounterId, isNew]);

  useEffect(() => {
    if (!session || !patientId || !isNew) return;
    if (autoCreateEncounterRef.current) return;
    if (providers.length === 0) return;

    autoCreateEncounterRef.current = true;

    const providerId = providers.length > 0 ? providers[0].id : session.user.id;
    createEncounter(session.tenantId, session.accessToken, { patientId, providerId })
      .then((res) => {
        const createdId = res?.encounter?.id || res?.id;
        if (!createdId) {
          showError('Failed to create encounter');
          return;
        }
        navigate(`/patients/${patientId}/encounter/${createdId}`, { replace: true });
      })
      .catch((err: any) => {
        showError(err.message || 'Failed to create encounter');
        autoCreateEncounterRef.current = false;
      });
  }, [session, patientId, isNew, providers, navigate, showError]);

  useEffect(() => {
    if (isNew || !patientId || !encounterId) return;
    if (encounter.status === 'signed' || encounter.status === 'locked') {
      clearActiveEncounter();
      return;
    }

    const patientName = patient ? `${patient.firstName} ${patient.lastName}`.trim() : undefined;
    const cachedAppointmentTypeName = encounter.appointmentId
      ? sessionStorage.getItem(`encounter:appointmentType:${encounter.appointmentId}`) || undefined
      : undefined;

    setActiveEncounter({
      encounterId,
      patientId,
      patientName,
      appointmentTypeName: encounterStartState.appointmentTypeName || cachedAppointmentTypeName,
      startedAt: new Date().toISOString(),
      startedEncounterFrom: encounterStartState.startedEncounterFrom,
      undoAppointmentStatus: encounterStartState.undoAppointmentStatus,
      returnPath: encounterStartState.returnPath,
    });
  }, [
    isNew,
    patientId,
    encounterId,
    patient,
    encounter.appointmentId,
    encounter.status,
    encounterStartState.appointmentTypeName,
    encounterStartState.startedEncounterFrom,
    encounterStartState.undoAppointmentStatus,
    encounterStartState.returnPath,
  ]);

  // Save encounter function for autosave
  const performSave = useCallback(async () => {
    if (!session || !patientId || isNew || isLocked) return;
    if (!encounterId) return;

    await updateEncounter(session.tenantId, session.accessToken, encounterId, {
      chiefComplaint: encounter.chiefComplaint ?? '',
      hpi: encounter.hpi ?? '',
      ros: encounter.ros ?? '',
      exam: encounter.exam ?? '',
      assessmentPlan: encounter.assessmentPlan ?? '',
    });
  }, [session, patientId, encounterId, isNew, isLocked, encounter]);

  // Autosave hook
  const autosave = useAutosave({
    data: encounter,
    onSave: performSave,
    delay: 3000,
    enabled: !isNew && !isLocked && !!encounterId,
  });

  // Manual save handler
  const handleSave = async () => {
    if (!session || !patientId) return;

    // Use the first available provider, or fall back to session user id
    const providerId = providers.length > 0 ? providers[0].id : session.user.id;

    setSaving(true);
    try {
      if (isNew) {
        const payload: Record<string, string> = {
          patientId,
          providerId,
        };
        if (encounter.chiefComplaint) payload.chiefComplaint = encounter.chiefComplaint;
        if (encounter.hpi) payload.hpi = encounter.hpi;
        if (encounter.ros) payload.ros = encounter.ros;
        if (encounter.exam) payload.exam = encounter.exam;
        if (encounter.assessmentPlan) payload.assessmentPlan = encounter.assessmentPlan;

        const res = await createEncounter(session.tenantId, session.accessToken, payload);
        const createdId = res?.encounter?.id || res?.id;
        if (!createdId) {
          showError('Failed to create encounter');
          return;
        }
        showSuccess('Encounter created');
        navigate(`/patients/${patientId}/encounter/${createdId}`, { replace: true });
      } else if (encounterId) {
        await autosave.saveNow();
        showSuccess('Encounter saved');
      }
    } catch (err: any) {
      showError(err.message || 'Failed to save encounter');
    } finally {
      setSaving(false);
    }
  };

  const runLiveCodingSync = useCallback(async (options?: { force?: boolean }) => {
    if (!session || !encounterId || isNew || isLocked) return;

    const payload = {
      chiefComplaint: encounter.chiefComplaint ?? '',
      hpi: encounter.hpi ?? '',
      ros: encounter.ros ?? '',
      exam: encounter.exam ?? '',
      assessmentPlan: encounter.assessmentPlan ?? '',
    };
    const documentationText = Object.values(payload).join('\n').trim();
    if (documentationText.length < 20) return;

    const serialized = JSON.stringify(payload);
    if (!options?.force && serialized === lastLiveCodingPayloadRef.current) return;
    lastLiveCodingPayloadRef.current = serialized;

    setLiveCodingSyncing(true);
    setLiveCodingError(null);
    try {
      const result = await syncLiveEncounterCoding(session.tenantId, session.accessToken, encounterId, payload);
      setLiveCodingResult(result);
      setDiagnoses(result.diagnoses as EncounterDiagnosis[]);
      setCharges(result.charges as Charge[]);
      setLastLiveCodingSyncedAt(new Date().toISOString());
    } catch (err: any) {
      setLiveCodingError(err.message || 'Live coding sync failed');
    } finally {
      setLiveCodingSyncing(false);
    }
  }, [session, encounterId, isNew, isLocked, encounter.chiefComplaint, encounter.hpi, encounter.ros, encounter.exam, encounter.assessmentPlan]);

  useEffect(() => {
    if (!session || !encounterId || isNew || isLocked) return;
    const timer = window.setTimeout(() => {
      void runLiveCodingSync();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [
    session,
    encounterId,
    isNew,
    isLocked,
    encounter.chiefComplaint,
    encounter.hpi,
    encounter.ros,
    encounter.exam,
    encounter.assessmentPlan,
    runLiveCodingSync,
  ]);

  const saveAndSignEncounter = async () => {
    if (!session || !encounterId || isNew) return;

    if (!isLocked) {
      await updateEncounter(session.tenantId, session.accessToken, encounterId, {
        chiefComplaint: encounter.chiefComplaint ?? '',
        hpi: encounter.hpi ?? '',
        ros: encounter.ros ?? '',
        exam: encounter.exam ?? '',
        assessmentPlan: encounter.assessmentPlan ?? '',
      });
    }

    if (!isClosedEncounter) {
      await updateEncounterStatus(session.tenantId, session.accessToken, encounterId, 'signed');
      setEncounter((prev) => ({ ...prev, status: 'signed' }));
    }
  };

  const sendAppointmentToCheckout = async () => {
    if (!session || !encounter.appointmentId) return;

    try {
      await updatePatientFlowStatus(session.tenantId, session.accessToken, encounter.appointmentId, 'checkout');
    } catch {
      try {
        await updateAppointmentStatus(session.tenantId, session.accessToken, encounter.appointmentId, 'checkout');
      } catch {
        await checkOutFrontDeskAppointment(session.tenantId, session.accessToken, encounter.appointmentId);
      }
    }
  };

  // Sign encounter
  const handleSign = async () => {
    if (!session || !encounterId || isNew) return;

    setSaving(true);
    try {
      await saveAndSignEncounter();

      setShowSignModal(false);
      clearActiveEncounter();
      if (encounter.appointmentId) {
        await sendAppointmentToCheckout();
        showSuccess('Encounter signed and appointment sent to checkout');
        navigate('/office-flow');
      } else {
        showSuccess('Encounter signed and locked');
        navigate(`/patients/${patientId}`);
      }
    } catch (err: any) {
      showError(err.message || 'Failed to sign encounter');
    } finally {
      setSaving(false);
    }
  };

  const handleEndAppointment = async () => {
    if (!session || isNew || !encounter.appointmentId) return;

    setEndingAppointment(true);
    try {
      await saveAndSignEncounter();
      await sendAppointmentToCheckout();
      showSuccess('Encounter signed and appointment sent to checkout');
      clearActiveEncounter();
      navigate('/office-flow');
    } catch (err: any) {
      showError(err.message || 'Failed to end appointment');
    } finally {
      setEndingAppointment(false);
    }
  };

  const handleCancelStartedVisit = async () => {
    if (!session || isNew || !encounter.appointmentId) return;
    if (!encounterStartState.startedEncounterFrom) return;

    setCancellingStartedVisit(true);
    try {
      const restoreStatus = encounterStartState.undoAppointmentStatus || 'in_room';
      await updateAppointmentStatus(session.tenantId, session.accessToken, encounter.appointmentId, restoreStatus);
      showSuccess('Encounter start cancelled');
      clearActiveEncounter();
      const returnPath = encounterStartState.returnPath
        || (encounterStartState.startedEncounterFrom === 'schedule' ? '/schedule' : '/office-flow');
      navigate(returnPath, { replace: true });
    } catch (err: any) {
      showError(err.message || 'Failed to cancel started visit');
    } finally {
      setCancellingStartedVisit(false);
    }
  };

  // Save vitals
  const handleSaveVitals = async () => {
    if (!session || !patientId || !encounterId || isNew) return;

    try {
      await createVitals(session.tenantId, session.accessToken, {
        patientId,
        encounterId,
        heightCm: vitalsForm.heightCm ? parseFloat(vitalsForm.heightCm) : undefined,
        weightKg: vitalsForm.weightKg ? parseFloat(vitalsForm.weightKg) : undefined,
        bpSystolic: vitalsForm.bpSystolic ? parseInt(vitalsForm.bpSystolic) : undefined,
        bpDiastolic: vitalsForm.bpDiastolic ? parseInt(vitalsForm.bpDiastolic) : undefined,
        pulse: vitalsForm.pulse ? parseInt(vitalsForm.pulse) : undefined,
        tempC: vitalsForm.tempC ? parseFloat(vitalsForm.tempC) : undefined,
      });
      showSuccess('Vitals saved');
      setShowVitalsModal(false);
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to save vitals');
    }
  };

  // Add order
  const handleAddOrder = async () => {
    if (!session || !encounterId || isNew) return;

    try {
      const orderPayload: {
        encounterId: string;
        patientId: string;
        type: string;
        details: string;
        providerId?: string;
      } = {
        encounterId,
        patientId: patientId!,
        providerId: (encounter.providerId as string | undefined) || undefined,
        type: orderForm.type,
        details: orderForm.details,
      };

      const encounterProviderId = (encounter.providerId as string | undefined)?.trim();
      if (encounterProviderId) {
        orderPayload.providerId = encounterProviderId;
      }

      await createOrder(session.tenantId, session.accessToken, orderPayload);
      showSuccess('Order added');
      setShowOrderModal(false);
      setOrderForm({ type: 'lab', details: '' });
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to add order');
    }
  };

  // Add diagnosis
  const handleAddDiagnosis = async (code: ICD10Code, isPrimary: boolean) => {
    if (!session || !encounterId || isNew) return;

    try {
      await createDiagnosis(session.tenantId, session.accessToken, {
        encounterId,
        icd10Code: code.code,
        description: code.description,
        isPrimary,
      });
      showSuccess('Diagnosis added');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to add diagnosis');
    }
  };

  // Toggle primary diagnosis
  const handleTogglePrimary = async (diagnosisId: string, isPrimary: boolean) => {
    if (!session) return;

    try {
      await updateDiagnosis(session.tenantId, session.accessToken, diagnosisId, { isPrimary });
      showSuccess('Primary diagnosis updated');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to update diagnosis');
    }
  };

  // Delete diagnosis
  const handleDeleteDiagnosis = async (diagnosisId: string) => {
    if (!session) return;

    try {
      await deleteDiagnosis(session.tenantId, session.accessToken, diagnosisId);
      showSuccess('Diagnosis removed');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to delete diagnosis');
    }
  };

  const handleConfirmAiDiagnosis = async (diagnosis: EncounterDiagnosis) => {
    if (!session) return;

    try {
      await updateDiagnosis(session.tenantId, session.accessToken, diagnosis.id, {
        description: cleanAiDiagnosisDescription(diagnosis.description) || diagnosis.description || 'Diagnosis',
        isPrimary: diagnosis.isPrimary,
      });
      showSuccess('Diagnosis confirmed for the encounter');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to confirm diagnosis');
    }
  };

  // Add procedure/charge
  const handleAddProcedure = async (procedure: {
    code: string;
    codeType?: 'CPT' | 'HCPCS' | 'INTERNAL';
    billingRoute?: 'insurance' | 'self_pay' | 'non_billable';
    description: string;
    quantity: number;
    feeCents: number;
    linkedDiagnosisIds: string[];
  }) => {
    if (!session || !encounterId || isNew) return;

    try {
      const billingRoute = procedure.billingRoute || (procedure.codeType === 'INTERNAL' ? 'self_pay' : 'insurance');
      const linkedDiagnosisIds = billingRoute === 'insurance' ? procedure.linkedDiagnosisIds : [];
      const icdCodes = linkedDiagnosisIds
        .map((diagnosisId) => diagnoses.find((dx) => dx.id === diagnosisId)?.icd10Code)
        .filter((code): code is string => Boolean(code));

      await createCharge(session.tenantId, session.accessToken, {
        encounterId,
        cptCode: procedure.code,
        codeType: procedure.codeType,
        billingRoute,
        description: procedure.description,
        quantity: procedure.quantity,
        feeCents: procedure.feeCents,
        linkedDiagnosisIds,
        icdCodes,
        amountCents: procedure.feeCents * procedure.quantity,
        status: billingRoute === 'self_pay' ? 'self_pay' : 'pending',
      });
      showSuccess('Charge added');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to add charge');
    }
  };

  const handleRecordPerformedWork = async (submission: PerformedWorkSubmission) => {
    if (!session || !encounterId || isNew) return;

    const linkedDiagnosisIds = submission.billingRoute === 'insurance' ? submission.linkedDiagnosisIds : [];
    const icdCodes = linkedDiagnosisIds
      .map((diagnosisId) => diagnoses.find((dx) => dx.id === diagnosisId)?.icd10Code)
      .filter((code): code is string => Boolean(code));

    if (submission.billingRoute === 'insurance' && icdCodes.length === 0) {
      showError('Select at least one diagnosis for insurance-routed procedures.');
      return;
    }

    try {
      for (const lineItem of submission.lineItems) {
        await createCharge(session.tenantId, session.accessToken, {
          encounterId,
          cptCode: lineItem.cptCode,
          description: lineItem.description,
          quantity: lineItem.quantity,
          feeCents: lineItem.feeCents,
          amountCents: lineItem.feeCents * lineItem.quantity,
          linkedDiagnosisIds,
          icdCodes,
          billingRoute: submission.billingRoute,
          codeType: submission.billingRoute === 'self_pay' ? 'INTERNAL' : undefined,
          status: submission.billingRoute === 'insurance' ? 'pending' : 'self_pay',
        });
      }

      const lineItemCount = submission.lineItems.length;
      showSuccess(
        `${submission.templateName} recorded (${lineItemCount} ${lineItemCount === 1 ? 'line' : 'lines'})`,
      );
      setShowPerformedWorkModal(false);
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to record performed work');
    }
  };

  // Delete charge
  const handleDeleteCharge = async (chargeId: string) => {
    if (!session) return;

    try {
      await deleteCharge(session.tenantId, session.accessToken, chargeId);
      showSuccess('Charge removed');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to delete charge');
    }
  };

  const loadAiTemplates = async () => {
    if (!session) return;
    setAiTemplateLoading(true);
    setAiTemplateError(null);
    try {
      const res = await fetchNoteTemplates(session.tenantId, session.accessToken);
      setAiTemplates(res.templates || []);
    } catch (err: any) {
      setAiTemplateError(err.message || 'Failed to load templates');
    } finally {
      setAiTemplateLoading(false);
    }
  };

  const openAiDraftModal = () => {
    setAiDraftError(null);
    setAiDraftResult(null);
    setAiDraftInput({
      chiefComplaint: encounter.chiefComplaint || '',
      briefNotes: '',
    });
    if (session && !aiTemplateLoading && aiTemplates.length === 0) {
      void loadAiTemplates();
    }
    setShowAiDraftModal(true);
  };

  const handleGenerateAiDraft = async () => {
    if (!session || !patientId) return;

    if (!aiDraftInput.chiefComplaint && !aiDraftInput.briefNotes.trim()) {
      setAiDraftError('Add a chief complaint or brief notes to generate a draft.');
      return;
    }

    setAiDraftLoading(true);
    setAiDraftError(null);
    setAiDraftResult(null);

    try {
      const res = await generateAiNoteDraft(session.tenantId, session.accessToken, {
        patientId,
        encounterId: isNew ? undefined : encounterId,
        chiefComplaint: aiDraftInput.chiefComplaint || undefined,
        briefNotes: aiDraftInput.briefNotes || undefined,
        templateId: aiTemplateId || undefined,
      });
      setAiDraftResult(res.draft);
    } catch (err: any) {
      setAiDraftError(err.message || 'Failed to generate AI draft');
    } finally {
      setAiDraftLoading(false);
    }
  };

  const applyAiDraft = async (mode: 'replace' | 'merge') => {
    if (!aiDraftResult) return;

    const mergeText = (current: string | undefined, incoming: string) => {
      if (!incoming) return current || '';
      if (!current) return incoming;
      return `${current}\n\n${incoming}`;
    };

    const updated = {
      chiefComplaint: mode === 'merge'
        ? mergeText(encounter.chiefComplaint, aiDraftResult.chiefComplaint)
        : aiDraftResult.chiefComplaint,
      hpi: mode === 'merge'
        ? mergeText(encounter.hpi, aiDraftResult.hpi)
        : aiDraftResult.hpi,
      ros: mode === 'merge'
        ? mergeText(encounter.ros, aiDraftResult.ros)
        : aiDraftResult.ros,
      exam: mode === 'merge'
        ? mergeText(encounter.exam, aiDraftResult.exam)
        : aiDraftResult.exam,
      assessmentPlan: mode === 'merge'
        ? mergeText(encounter.assessmentPlan, aiDraftResult.assessmentPlan)
        : aiDraftResult.assessmentPlan,
    };

    setEncounter((prev) => ({ ...prev, ...updated }));
    setShowAiDraftModal(false);
    setAiDraftResult(null);

    if (!session || isNew || !encounterId || isLocked) {
      showSuccess('AI draft applied');
      return;
    }

    try {
      await updateEncounter(session.tenantId, session.accessToken, encounterId, updated);
      showSuccess('AI draft applied');
    } catch (err: any) {
      showError(err.message || 'Failed to save AI draft');
    }
  };

  // Apply note template
  const handleApplyTemplate = (templateContent: NoteTemplate['templateContent']) => {
    // Check if there's existing content
    const hasExistingContent = !!(
      encounter.chiefComplaint ||
      encounter.hpi ||
      encounter.ros ||
      encounter.exam ||
      encounter.assessmentPlan
    );

    if (hasExistingContent) {
      const confirmReplace = window.confirm(
        'This encounter already has content. Do you want to replace it with the template? Click OK to replace or Cancel to merge.'
      );

      if (!confirmReplace) {
        // Merge mode - append template content
        setEncounter((prev) => ({
          ...prev,
          chiefComplaint: prev.chiefComplaint
            ? `${prev.chiefComplaint}\n\n${replaceVariables(templateContent.chiefComplaint || '')}`
            : replaceVariables(templateContent.chiefComplaint || ''),
          hpi: prev.hpi
            ? `${prev.hpi}\n\n${replaceVariables(templateContent.hpi || '')}`
            : replaceVariables(templateContent.hpi || ''),
          ros: prev.ros
            ? `${prev.ros}\n\n${replaceVariables(templateContent.ros || '')}`
            : replaceVariables(templateContent.ros || ''),
          exam: prev.exam
            ? `${prev.exam}\n\n${replaceVariables(templateContent.exam || '')}`
            : replaceVariables(templateContent.exam || ''),
          assessmentPlan: prev.assessmentPlan
            ? `${prev.assessmentPlan}\n\n${replaceVariables(templateContent.assessmentPlan || '')}`
            : replaceVariables(templateContent.assessmentPlan || ''),
        }));
        showSuccess('Template merged with existing content');
        return;
      }
    }

    // Replace mode
    setEncounter((prev) => ({
      ...prev,
      chiefComplaint: replaceVariables(templateContent.chiefComplaint || ''),
      hpi: replaceVariables(templateContent.hpi || ''),
      ros: replaceVariables(templateContent.ros || ''),
      exam: replaceVariables(templateContent.exam || ''),
      assessmentPlan: replaceVariables(templateContent.assessmentPlan || ''),
    }));

    showSuccess('Template applied successfully');
  };

  // Replace template variables
  const replaceVariables = (text: string): string => {
    if (!text) return '';
    if (!patient) return text;

    let result = text;

    // Calculate age from DOB
    const age = patient.dob
      ? Math.floor((new Date().getTime() - new Date(patient.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : 'N/A';

    // Replace variables
    result = result.replace(/\{\{patientName\}\}/g, `${patient.firstName} ${patient.lastName}`);
    result = result.replace(/\{\{patientAge\}\}/g, String(age));
    result = result.replace(/\{\{date\}\}/g, new Date().toLocaleDateString());
    result = result.replace(/\{\{providerName\}\}/g, session?.user?.fullName || 'Provider');

    // If chief complaint exists in encounter, use it
    if (encounter.chiefComplaint) {
      result = result.replace(/\{\{chiefComplaint\}\}/g, encounter.chiefComplaint);
    }

    return result;
  };

  if (loading) {
    return (
      <div className="encounter-page">
        <Skeleton variant="card" height={140} />
        <Skeleton variant="card" height={500} />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="encounter-page">
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <h3 style={{ color: '#374151', marginBottom: '0.5rem' }}>Patient Not Found</h3>
          <p style={{ color: '#6b7280' }}>The requested patient could not be found.</p>
        </div>
      </div>
    );
  }

  const sections: { id: EncounterSection; label: string; icon: string }[] = [
    { id: 'note', label: 'Clinical Note', icon: '' },
    { id: 'exam', label: 'Skin Exam', icon: '' },
    { id: 'orders', label: 'Orders', icon: '' },
    { id: 'prescriptions', label: 'Prescriptions', icon: '💊' },
    { id: 'billing', label: 'Billing', icon: '' },
  ];
  const handleBodyDiagramMarkersChange = (markers: BodyMarker[]) => {
    setBodyDiagramMarkers(markers);
  };
  const bodyDiagramLesionCount = bodyDiagramMarkers.filter((marker) => marker.type === 'lesion').length;
  const inventoryProviderId = (encounter.providerId as string | undefined) || session?.user.id || '';
  const cachedAppointmentTypeName = !isNew && encounter.appointmentId
    ? sessionStorage.getItem(`encounter:appointmentType:${encounter.appointmentId}`) || ''
    : '';
  const appointmentTypeName = encounterStartState.appointmentTypeName || cachedAppointmentTypeName;
  const isLaserVisit = /laser/i.test(appointmentTypeName);
  const getChargeBillingRoute = (charge: Charge) => (
    charge.billingRoute || (charge.status === 'self_pay' ? 'self_pay' : 'insurance')
  );
  const getChargeTotalCents = (charge: Charge) => (
    charge.amountCents ?? (charge.feeCents || 0) * (charge.quantity || 1)
  );
  const getChargeDiagnosisCodes = (charge: Charge) => {
    if (charge.icdCodes && charge.icdCodes.length > 0) return charge.icdCodes;
    return (charge.linkedDiagnosisIds || [])
      .map((diagnosisId) => diagnoses.find((dx) => dx.id === diagnosisId)?.icd10Code)
      .filter((code): code is string => Boolean(code));
  };
  const hasChargesMissingRequiredDiagnosisLinks = charges.some((charge) => {
    if (getChargeBillingRoute(charge) !== 'insurance') return false;
    const missingDiagnosisLink = !charge.linkedDiagnosisIds || charge.linkedDiagnosisIds.length === 0;
    if (!missingDiagnosisLink) return false;

    return !isCosmeticProcedure({
      code: charge.cptCode,
      description: charge.description,
    });
  });
  const insuranceCharges = charges.filter((charge) => getChargeBillingRoute(charge) === 'insurance');
  const patientResponsibleCharges = charges.filter((charge) => getChargeBillingRoute(charge) !== 'insurance');
  const insuranceChargesTotalCents = charges
    .filter((charge) => getChargeBillingRoute(charge) === 'insurance')
    .reduce((sum, charge) => sum + getChargeTotalCents(charge), 0);
  const selfPayChargesTotalCents = charges
    .filter((charge) => getChargeBillingRoute(charge) !== 'insurance')
    .reduce((sum, charge) => sum + getChargeTotalCents(charge), 0);
  const diagnosisSuggestionContext = [
    encounter.chiefComplaint,
    encounter.hpi,
    encounter.ros,
    encounter.exam,
    encounter.assessmentPlan,
    scribeNote?.hpi,
    scribeNote?.physicalExam,
    scribeNote?.assessment,
    scribeNote?.plan,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join('\n');
  const renderChargeSheet = (
    title: string,
    subtitle: string,
    chargeRows: Charge[],
    accent: string,
    emptyText: string,
  ) => (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '10px',
      overflow: 'hidden',
      background: '#ffffff',
      marginBottom: '1rem'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.85rem 1rem',
        background: '#f8fafc',
        borderBottom: '1px solid #e5e7eb',
        flexWrap: 'wrap'
      }}>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: accent }}>{title}</div>
          <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.15rem' }}>{subtitle}</div>
        </div>
        <div style={{ fontWeight: 800, color: '#111827' }}>
          ${(chargeRows.reduce((sum, charge) => sum + getChargeTotalCents(charge), 0) / 100).toFixed(2)}
        </div>
      </div>

      {chargeRows.length === 0 ? (
        <div style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>
          {emptyText}
        </div>
      ) : (
        <table className="ema-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Procedure</th>
              <th style={{ width: '160px' }}>Diagnosis</th>
              <th style={{ width: '110px', textAlign: 'right' }}>Unit Price</th>
              <th style={{ width: '70px', textAlign: 'center' }}>Units</th>
              <th style={{ width: '110px', textAlign: 'right' }}>Charge</th>
              <th style={{ width: '110px' }}>Route</th>
              <th style={{ width: '90px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {chargeRows.map((charge) => {
              const diagnosisCodes = getChargeDiagnosisCodes(charge);
              const route = getChargeBillingRoute(charge);
              return (
                <tr key={charge.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, color: accent }}>{charge.cptCode}</span>
                      {charge.codeType && (
                        <span style={{
                          padding: '0.12rem 0.4rem',
                          borderRadius: '999px',
                          background: '#eef2ff',
                          color: '#3730a3',
                          fontSize: '0.62rem',
                          fontWeight: 700
                        }}>
                          {charge.codeType}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '0.2rem' }}>
                      {charge.description}
                    </div>
                  </td>
                  <td>
                    {route === 'insurance' ? (
                      diagnosisCodes.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {diagnosisCodes.map((code) => (
                            <span
                              key={`${charge.id}-${code}`}
                              style={{
                                padding: '0.15rem 0.42rem',
                                background: '#dbeafe',
                                color: '#1e40af',
                                borderRadius: '999px',
                                fontSize: '0.68rem',
                                fontWeight: 700
                              }}
                            >
                              {code}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 700 }}>Missing DX</span>
                      )
                    ) : (
                      <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>Not claim billed</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    ${((charge.feeCents || 0) / 100).toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center' }}>{charge.quantity || 1}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800 }}>
                    ${(getChargeTotalCents(charge) / 100).toFixed(2)}
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '999px',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        background: route === 'self_pay' ? '#ede9fe' : route === 'non_billable' ? '#f3f4f6' : '#dbeafe',
                        color: route === 'self_pay' ? '#5b21b6' : route === 'non_billable' ? '#374151' : '#1e40af',
                        textTransform: 'uppercase',
                      }}
                    >
                      {route === 'self_pay' ? 'Self-Pay' : route === 'non_billable' ? 'No Bill' : 'Insurance'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleDeleteCharge(charge.id)}
                      disabled={isLocked}
                      style={{
                        padding: '0.25rem 0.5rem',
                        background: '#fee2e2',
                        color: '#dc2626',
                        border: '1px solid #fca5a5',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        cursor: isLocked ? 'not-allowed' : 'pointer',
                        opacity: isLocked ? 0.6 : 1
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className="encounter-page">
      {/* Patient Banner */}
      <PatientBanner patient={patient} compact />

      {/* Action Bar */}
      <div className="ema-action-bar">
        <button
          type="button"
          className="ema-action-btn"
          onClick={() => navigate(`/patients/${patientId}`)}
        >
          <span className="icon">←</span>
          Back to Chart
        </button>

        {!isNew && encounter.appointmentId && encounterStartState.startedEncounterFrom && (
          <button
            type="button"
            className="ema-action-btn"
            onClick={handleCancelStartedVisit}
            disabled={cancellingStartedVisit}
            style={{ background: '#f59e0b', color: '#ffffff' }}
          >
            <span className="icon">↩</span>
            {cancellingStartedVisit ? 'Cancelling...' : 'Cancel Started Visit'}
          </button>
        )}

        {/* Autosave Status Indicator */}
        {!isNew && !isLocked && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            color: '#6b7280'
          }}>
            {autosave.status === 'saving' && (
              <>
                <span style={{ color: '#f59e0b' }}>●</span>
                <span>Saving...</span>
              </>
            )}
            {autosave.status === 'saved' && (
              <>
                <span style={{ color: '#10b981' }}></span>
                <span>Saved</span>
              </>
            )}
            {autosave.status === 'error' && (
              <>
                <span style={{ color: '#ef4444' }}>✗</span>
                <span>Error saving</span>
              </>
            )}
            {autosave.lastSaved && (
              <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                Last saved: {new Date(autosave.lastSaved).toLocaleTimeString()}
              </span>
            )}
          </div>
        )}

        <button
          type="button"
          className="ema-action-btn"
          onClick={handleSave}
          disabled={saving || isLocked}
        >
          <span className="icon"></span>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {!isNew && encounter.status === 'draft' && (
          <button
            type="button"
            className="ema-action-btn"
            onClick={() => setShowSignModal(true)}
            disabled={saving}
            style={{ background: '#10b981', color: '#ffffff' }}
          >
            <span className="icon"></span>
            {encounter.appointmentId ? 'Sign & Checkout' : 'Sign & Lock'}
          </button>
        )}
        {!isNew && encounter.appointmentId && (
          <button
            type="button"
            className="ema-action-btn"
            onClick={handleEndAppointment}
            disabled={endingAppointment}
            style={{ background: '#0284c7', color: '#ffffff' }}
          >
            <span className="icon"></span>
            {endingAppointment
              ? (isLaserVisit ? 'Completing...' : 'Ending...')
              : (isLaserVisit ? 'Complete & Checkout' : 'End to Checkout')}
          </button>
        )}
        <button
          type="button"
          className="ema-action-btn"
          onClick={() => setShowTemplateSelector(true)}
          disabled={isLocked}
          style={{ background: '#7c3aed', color: '#ffffff' }}
        >
          <span className="icon"></span>
          Apply Template
        </button>
        <button
          type="button"
          className="ema-action-btn"
          onClick={openAiDraftModal}
          disabled={isLocked}
          style={{ background: '#0f766e', color: '#ffffff' }}
        >
          <span className="icon"></span>
          AI Draft
        </button>
        <button type="button" className="ema-action-btn" onClick={() => setShowVitalsModal(true)} disabled={isNew || isLocked}>
          <span className="icon"></span>
          Vitals
        </button>
        <button type="button" className="ema-action-btn" onClick={() => setShowOrderModal(true)} disabled={isNew || isLocked}>
          <span className="icon">+</span>
          Add Order
        </button>
        <button type="button" className="ema-action-btn" onClick={loadData}>
          <span className="icon"></span>
          Refresh
        </button>
      </div>

      {/* Section Header with Status Badge */}
      <div className="ema-section-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span>{isNew ? 'New Encounter' : 'Encounter'}</span>
        {appointmentTypeName && (
          <span style={{
            padding: '0.25rem 0.75rem',
            borderRadius: '999px',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: isLaserVisit ? '#fee2e2' : '#ede9fe',
            color: isLaserVisit ? '#991b1b' : '#5b21b6'
          }}>
            {appointmentTypeName}
          </span>
        )}
        {!isNew && encounter.status && (
          <span style={{
            padding: '0.25rem 0.75rem',
            borderRadius: '12px',
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            background: encounter.status === 'draft' ? '#fef3c7' :
                       encounter.status === 'finalized' ? '#dbeafe' :
                       encounter.status === 'signed' ? '#d1fae5' :
                       encounter.status === 'locked' ? '#e5e7eb' : '#f3f4f6',
            color: encounter.status === 'draft' ? '#92400e' :
                   encounter.status === 'finalized' ? '#1e40af' :
                   encounter.status === 'signed' ? '#065f46' :
                   encounter.status === 'locked' ? '#1f2937' : '#374151'
          }}>
            {encounter.status}
          </span>
        )}
        {!isNew && encounter.createdAt && (
          <span style={{ fontWeight: 400, fontSize: '0.875rem', color: '#6b7280' }}>
            {new Date(encounter.createdAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {!isNew && encounter.appointmentId && isLaserVisit && (
        <div style={{
          marginTop: '0.75rem',
          background: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '8px',
          padding: '0.875rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div>
            <div style={{ fontWeight: 600, color: '#92400e', marginBottom: '0.2rem' }}>Laser Procedure Workflow</div>
            <div style={{ fontSize: '0.8rem', color: '#78350f' }}>
              Document treatment details and used supplies, then complete the laser visit.
            </div>
          </div>
          <button
            type="button"
            className="ema-action-btn"
            onClick={handleEndAppointment}
            disabled={endingAppointment}
            style={{ background: '#b45309', color: '#ffffff', whiteSpace: 'nowrap' }}
          >
            {endingAppointment ? 'Completing...' : 'Complete Laser Visit'}
          </button>
        </div>
      )}

      {/* Locked Banner */}
      {isLocked && (
        <div style={{
          background: '#fef2f2',
          borderLeft: '4px solid #dc2626',
          padding: '1rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          fontSize: '0.875rem'
        }}>
          <span style={{ fontSize: '1.25rem' }}></span>
          <div>
            <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: '0.25rem' }}>
              This encounter is locked
            </div>
            <div style={{ color: '#7f1d1d' }}>
              This encounter has been signed and locked. All fields are read-only and cannot be edited.
            </div>
          </div>
        </div>
      )}

      {/* Vitals Strip */}
      <div style={{
        background: '#f0fdf4',
        borderLeft: '4px solid #10b981',
        padding: '0.75rem 1rem',
        display: 'flex',
        gap: '2rem',
        alignItems: 'center',
        fontSize: '0.875rem'
      }}>
        <span style={{ fontWeight: 600, color: '#047857' }}>Vitals:</span>
        {vitals ? (
          <>
            {vitals.bpSystolic && vitals.bpDiastolic && (
              <span><strong>BP:</strong> {vitals.bpSystolic}/{vitals.bpDiastolic}</span>
            )}
            {vitals.pulse && <span><strong>HR:</strong> {vitals.pulse} bpm</span>}
            {vitals.tempC && <span><strong>Temp:</strong> {vitals.tempC}°C</span>}
            {vitals.weightKg && <span><strong>Wt:</strong> {vitals.weightKg} kg</span>}
            {vitals.heightCm && <span><strong>Ht:</strong> {vitals.heightCm} cm</span>}
          </>
        ) : (
          <span style={{ color: '#6b7280' }}>No vitals recorded - Click "Vitals" to add</span>
        )}
      </div>

      {!isNew && patient && (
        <div style={{ marginTop: '1rem' }}>
          <ScribePanel
            patientId={patient.id}
            patientName={`${patient.firstName} ${patient.lastName}`}
            encounterId={encounterId}
            providerId={encounter?.providerId}
            encounterStatus={encounter?.status}
            onRecordingComplete={(recordingId) => {
              navigate(`/ambient-scribe?recordingId=${recordingId}&auto=1`);
            }}
          />
        </div>
      )}

      {/* Section Tabs - EMA Style */}
      <div style={{
        display: 'flex',
        background: '#f3f4f6',
        borderBottom: '1px solid #e5e7eb'
      }}>
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveSection(section.id)}
            style={{
              padding: '0.75rem 1.5rem',
              background: activeSection === section.id ? '#ffffff' : 'transparent',
              border: 'none',
              borderBottom: activeSection === section.id ? '3px solid #0369a1' : '3px solid transparent',
              color: activeSection === section.id ? '#0369a1' : '#6b7280',
              fontWeight: activeSection === section.id ? 600 : 400,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem'
            }}
          >
            <span>{section.icon}</span>
            {section.label}
          </button>
        ))}
      </div>

      {/* Section Content */}
      <div style={{ background: '#ffffff', padding: '1.5rem' }}>
        {activeSection === 'note' && (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            {scribeNoteLoading && (
              <Skeleton variant="card" height={180} />
            )}

            {!scribeNoteLoading && scribeNote && (
              <ScribeSummaryCard
                title="AI Scribe Summary"
                visitDate={scribeNote.completedAt || scribeNote.createdAt}
                statusLabel={scribeNote.reviewStatus === 'approved' ? 'Approved' : 'Draft'}
                symptoms={buildSymptoms(scribeNote, null)}
                potentialDiagnoses={buildDiagnoses(scribeNote, null)}
                suggestedTests={buildTests(scribeNote, null)}
                summaryText={buildSummaryText(scribeNote, null)}
                showDetails
              />
            )}

            {!scribeNoteLoading && !isNew && patient && (
              <ClinicalCopilotPanel
                patientId={patient.id}
                encounterId={encounterId}
                noteId={scribeNote?.id}
                title="Encounter AI Assistant"
                compact
                showOpenFullButton
              />
            )}

            {/* Chief Complaint */}
            <div className="ema-form-section">
              <div className="ema-section-header" style={{ marginBottom: '0.5rem' }}>Chief Complaint</div>
              <input
                type="text"
                className="ema-filter-input"
                value={encounter.chiefComplaint || ''}
                onChange={(e) => setEncounter((prev) => ({ ...prev, chiefComplaint: e.target.value }))}
                placeholder="e.g., Skin check, suspicious mole, rash on arms"
                style={{ width: '100%', padding: '0.75rem' }}
                disabled={isLocked}
                readOnly={isLocked}
              />
            </div>

            {/* HPI */}
            <div className="ema-form-section">
              <div className="ema-section-header" style={{ marginBottom: '0.5rem' }}>History of Present Illness (HPI)</div>
              <textarea
                value={encounter.hpi || ''}
                onChange={(e) => setEncounter((prev) => ({ ...prev, hpi: e.target.value }))}
                placeholder="Patient presents with..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  fontFamily: 'inherit'
                }}
                disabled={isLocked}
                readOnly={isLocked}
              />
            </div>

            {/* ROS */}
            <div className="ema-form-section">
              <div className="ema-section-header" style={{ marginBottom: '0.5rem' }}>
                Review of Systems (ROS)
                {!isLocked && (
                  <button
                    type="button"
                    onClick={() =>
                      setEncounter((prev) => ({
                        ...prev,
                        ros: 'Constitutional: Negative. HEENT: Negative. Respiratory: Negative. Cardiovascular: Negative. GI: Negative. GU: Negative. Musculoskeletal: Negative. Neurological: Negative. Psychiatric: Negative.',
                      }))
                    }
                    style={{
                      marginLeft: '1rem',
                      padding: '0.25rem 0.75rem',
                      background: '#e0f2fe',
                      color: '#0369a1',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    All Negative
                  </button>
                )}
              </div>
              <textarea
                value={encounter.ros || ''}
                onChange={(e) => setEncounter((prev) => ({ ...prev, ros: e.target.value }))}
                placeholder="Constitutional: No fever, chills, or weight loss..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  fontFamily: 'inherit'
                }}
                disabled={isLocked}
                readOnly={isLocked}
              />
            </div>

            {/* Assessment & Plan */}
            <div className="ema-form-section">
              <div className="ema-section-header" style={{ marginBottom: '0.5rem' }}>Assessment & Plan</div>
              <textarea
                value={encounter.assessmentPlan || ''}
                onChange={(e) => setEncounter((prev) => ({ ...prev, assessmentPlan: e.target.value }))}
                placeholder="1. Diagnosis - Treatment plan..."
                rows={6}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  fontFamily: 'inherit'
                }}
                disabled={isLocked}
                readOnly={isLocked}
              />
            </div>
          </div>
        )}

        {activeSection === 'exam' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Shared Body Diagram */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div className="ema-section-header">
                  Patient Body Diagram (Shared with Profile)
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => navigate(`/photos?patientId=${patientId}&encounterId=${encounter.id || encounterId}&action=upload`)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#0f766e',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                  >
                    Capture Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/body-diagram?patientId=${patientId}&encounterId=${encounter.id || encounterId}`)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#6B46C1',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    Full Body Diagram
                  </button>
                </div>
              </div>
              <p style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: '0.8rem', color: '#4b5563' }}>
                Markers added here update the same body diagram shown on the patient profile.
              </p>
              <div style={{
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1rem'
              }}>
                <PatientBodyDiagram
                  patientId={patientId || ''}
                  encounterId={!isNew ? (encounter.id || encounterId) : undefined}
                  editable={!isNew && !isLocked}
                  onMarkersChange={handleBodyDiagramMarkersChange}
                />
              </div>
            </div>

            {/* Exam Notes */}
            <div>
              <div className="ema-section-header" style={{ marginBottom: '0.75rem' }}>
                Physical Exam Notes
                {!isLocked && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setEncounter((prev) => ({
                          ...prev,
                          exam: (prev.exam || '') + '\n\nGeneral: Well-appearing, no acute distress.\nSkin: See lesion documentation.',
                        }))
                      }
                      style={{
                        marginLeft: '1rem',
                        padding: '0.25rem 0.75rem',
                        background: '#e0f2fe',
                        color: '#0369a1',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        cursor: 'pointer'
                      }}
                    >
                      + General Exam
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEncounter((prev) => ({
                          ...prev,
                          exam: (prev.exam || '') + '\n\nFull body skin exam performed. No other suspicious lesions identified.',
                        }))
                      }
                      style={{
                        marginLeft: '0.5rem',
                        padding: '0.25rem 0.75rem',
                        background: '#e0f2fe',
                        color: '#0369a1',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        cursor: 'pointer'
                      }}
                    >
                      + Full Body Exam
                    </button>
                  </>
                )}
              </div>
              <textarea
                value={encounter.exam || ''}
                onChange={(e) => setEncounter((prev) => ({ ...prev, exam: e.target.value }))}
                placeholder="General: Well-appearing, no acute distress.&#10;Skin: See body diagram findings."
                rows={20}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  fontFamily: 'inherit',
                  minHeight: '400px'
                }}
                disabled={isLocked}
                readOnly={isLocked}
              />
            </div>
          </div>
        )}

        {activeSection === 'orders' && (
          <div>
            {/* Quick Orders */}
            <div className="ema-section-header" style={{ marginBottom: '0.75rem' }}>Quick Orders</div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: '0.5rem',
              marginBottom: '1.5rem'
            }}>
              {[
                { type: 'biopsy', label: 'Shave Biopsy', details: 'Shave biopsy' },
                { type: 'biopsy', label: 'Punch Biopsy', details: 'Punch biopsy' },
                { type: 'procedure', label: 'Cryotherapy', details: 'Cryotherapy' },
                { type: 'procedure', label: 'Excision', details: 'Excision' },
                { type: 'lab', label: 'Pathology', details: 'Pathology - skin biopsy' },
                { type: 'referral', label: 'Mohs Referral', details: 'Mohs surgery referral' },
              ].map((order) => (
                <button
                  key={order.label}
                  type="button"
                  onClick={() => {
                    setOrderForm({ type: order.type, details: order.details });
                    setShowOrderModal(true);
                  }}
                  disabled={isNew}
                  style={{
                    padding: '0.75rem',
                    background: '#f3f4f6',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    cursor: isNew ? 'not-allowed' : 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    color: '#374151'
                  }}
                >
                  {order.label}
                </button>
              ))}
            </div>

            {/* Orders List */}
            <div className="ema-section-header" style={{ marginBottom: '0.75rem' }}>Orders ({orders.length})</div>
            {orders.length === 0 ? (
              <div style={{
                background: '#f9fafb',
                border: '1px dashed #d1d5db',
                borderRadius: '8px',
                padding: '3rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}></div>
                <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No orders yet</h3>
                <p style={{ color: '#6b7280', margin: 0 }}>Use quick orders above or click "Add Order" to create</p>
              </div>
            ) : (
              <table className="ema-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Details</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <span style={{
                          background: '#e0f2fe',
                          color: '#0369a1',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          textTransform: 'uppercase'
                        }}>
                          {order.type}
                        </span>
                      </td>
                      <td>{order.details}</td>
                      <td>
                        <span className={`ema-status ${order.status === 'completed' ? 'established' : 'pending'}`}>
                          {order.status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: '#f3f4f6',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeSection === 'prescriptions' && (
          <div>
            {!isNew && encounterId && patientId && (
              <EncounterPrescriptions
                encounterId={encounterId}
                patientId={patientId}
                readOnly={isLocked}
              />
            )}
            {isNew && (
              <div style={{
                background: '#fef3c7',
                border: '1px solid #f59e0b',
                borderRadius: '8px',
                padding: '1.5rem',
                textAlign: 'center'
              }}>
                <p style={{ color: '#92400e', marginBottom: '0.5rem' }}>
                  Please save the encounter first before adding prescriptions.
                </p>
                <button
                  type="button"
                  onClick={handleSave}
                  className="ema-action-btn"
                  style={{ marginTop: '0.5rem' }}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Encounter'}
                </button>
              </div>
            )}
          </div>
        )}

        {activeSection === 'billing' && (
          <div>
            {/* Live Coding Panel */}
            {!isNew && !isLocked && (
              <div style={{
                background: 'linear-gradient(135deg, #ecfeff 0%, #f8fafc 100%)',
                border: '1px solid #67e8f9',
                borderRadius: '12px',
                padding: '1rem',
                marginBottom: '1.5rem',
                boxShadow: '0 10px 24px rgba(8, 145, 178, 0.08)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <div>
                    <h4 style={{
                      fontSize: '0.9rem',
                      fontWeight: 800,
                      color: '#0e7490',
                      marginBottom: '0.2rem',
                    }}>
                      Live Documentation Coding
                    </h4>
                    <p style={{ fontSize: '0.76rem', color: '#155e75', margin: 0 }}>
                      As the note changes, the system links ICD-10 diagnoses to encounter charges and keeps the draft superbill current.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {lastLiveCodingSyncedAt && (
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        Last sync {new Date(lastLiveCodingSyncedAt).toLocaleTimeString()}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => runLiveCodingSync({ force: true })}
                      disabled={liveCodingSyncing}
                      style={{
                        padding: '0.5rem 0.75rem',
                        background: liveCodingSyncing ? '#bae6fd' : '#0e7490',
                        border: 'none',
                        borderRadius: '6px',
                        color: liveCodingSyncing ? '#075985' : '#ffffff',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        cursor: liveCodingSyncing ? 'wait' : 'pointer',
                      }}
                    >
                      {liveCodingSyncing ? 'Syncing...' : 'Sync Coding Now'}
                    </button>
                  </div>
                </div>

                {liveCodingError && (
                  <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.65rem 0.75rem', borderRadius: '8px', fontSize: '0.78rem', marginBottom: '0.75rem' }}>
                    {liveCodingError}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                  <div style={{ background: '#ffffff', border: '1px solid #cffafe', borderRadius: '10px', padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0e7490', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                      ICD-10 Diagnoses
                    </div>
                    {liveCodingResult?.suggestions.diagnoses.length ? (
                      <div style={{ display: 'grid', gap: '0.45rem' }}>
                        {liveCodingResult.suggestions.diagnoses.slice(0, 5).map((dx) => (
                          <div key={dx.code} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                            <span style={{ fontWeight: 900, color: '#155e75', minWidth: '4.2rem' }}>{dx.code}</span>
                            <span style={{ color: '#334155', fontSize: '0.78rem' }}>{dx.description}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>
                        Start documenting diagnoses, rash, lesion, biopsy, skin check, or cancer history to populate ICD-10 codes.
                      </p>
                    )}
                  </div>

                  <div style={{ background: '#ffffff', border: '1px solid #cffafe', borderRadius: '10px', padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0e7490', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                      Visit & Procedure Codes
                    </div>
                    {liveCodingResult?.suggestions.charges.length ? (
                      <div style={{ display: 'grid', gap: '0.45rem' }}>
                        {liveCodingResult.suggestions.charges.slice(0, 5).map((charge) => (
                          <div key={charge.cptCode} style={{ display: 'grid', gap: '0.1rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <span style={{ fontWeight: 900, color: '#155e75' }}>{charge.cptCode}</span>
                              <span style={{ color: '#334155', fontSize: '0.78rem' }}>{charge.description}</span>
                            </div>
                            <span style={{ color: '#64748b', fontSize: '0.7rem' }}>
                              ${(charge.amountCents / 100).toFixed(2)} · {charge.reason}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>
                        E/M and procedure lines will appear when the note supports a visit, biopsy, cryotherapy, or injection.
                      </p>
                    )}
                  </div>

                  <div style={{ background: '#ffffff', border: '1px solid #cffafe', borderRadius: '10px', padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0e7490', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                      Draft Superbill
                    </div>
                    {liveCodingResult?.superbill ? (
                      <div style={{ display: 'grid', gap: '0.35rem', color: '#334155', fontSize: '0.78rem' }}>
                        <span>Status: <strong>{liveCodingResult.superbill.status}</strong></span>
                        <span>Lines: <strong>{liveCodingResult.superbill.lineCount}</strong></span>
                        <span>Total: <strong>${(liveCodingResult.superbill.totalChargesCents / 100).toFixed(2)}</strong></span>
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>
                        The draft superbill will sync once documentation supports billable coding.
                      </p>
                    )}
                  </div>
                </div>

                {liveCodingResult?.warnings.length ? (
                  <div style={{ marginTop: '0.75rem', color: '#92400e', fontSize: '0.76rem' }}>
                    {liveCodingResult.warnings.join(' ')}
                  </div>
                ) : null}
              </div>
            )}

            {/* Billing Warnings */}
            {!diagnoses.some(d => d.isPrimary) && diagnoses.length > 0 && (
              <div style={{
                background: '#fef3c7',
                borderLeft: '4px solid #f59e0b',
                padding: '1rem 1.5rem',
                marginBottom: '1.5rem',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <span style={{ fontSize: '1.25rem' }}>⚠</span>
                <span style={{ color: '#92400e' }}>
                  <strong>Warning:</strong> No primary diagnosis selected. Please mark one diagnosis as primary for proper billing.
                </span>
              </div>
            )}

            {hasChargesMissingRequiredDiagnosisLinks && (
              <div style={{
                background: '#fef3c7',
                borderLeft: '4px solid #f59e0b',
                padding: '1rem 1.5rem',
                marginBottom: '1.5rem',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <span style={{ fontSize: '1.25rem' }}>⚠</span>
                <span style={{ color: '#92400e' }}>
                  <strong>Warning:</strong> Some medical procedures are not linked to diagnoses. Insurance and CMS billing requires those procedures to be linked to at least one diagnosis.
                </span>
              </div>
            )}

            {/* Diagnoses Section */}
            <div className="ema-form-section" style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div className="ema-section-header">Diagnoses (ICD-10)</div>
                <button
                  type="button"
                  onClick={() => setShowDiagnosisModal(true)}
                  disabled={isNew || isLocked}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#0369a1',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    fontWeight: 500,
                    cursor: isNew || isLocked ? 'not-allowed' : 'pointer',
                    opacity: isNew || isLocked ? 0.6 : 1,
                    fontSize: '0.875rem'
                  }}
                >
                  + Add Diagnosis
                </button>
              </div>

              {diagnoses.length === 0 ? (
                <div style={{
                  background: '#f9fafb',
                  border: '1px dashed #d1d5db',
                  borderRadius: '8px',
                  padding: '2rem',
                  textAlign: 'center',
                  color: '#6b7280'
                }}>
                  No diagnoses added yet. Click "Add Diagnosis" to start.
                </div>
              ) : (
                <table className="ema-table">
                  <thead>
                    <tr>
                      <th style={{ width: '120px' }}>ICD-10 Code</th>
                      <th>Description</th>
                      <th style={{ width: '120px' }}>Type</th>
                      <th style={{ width: '100px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnoses.map((dx) => {
                      const isAiSuggestion = isAiSuggestedDiagnosis(dx);
                      return (
                        <tr key={dx.id}>
                        <td style={{ fontWeight: 600, color: '#0369a1' }}>{dx.icd10Code}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span>{isAiSuggestion ? cleanAiDiagnosisDescription(dx.description) : dx.description}</span>
                            {isAiSuggestion && (
                              <span style={{
                                padding: '0.18rem 0.5rem',
                                background: '#fffbeb',
                                color: '#92400e',
                                border: '1px solid #fde68a',
                                borderRadius: '999px',
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                              }}>
                                Needs review
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          {dx.isPrimary ? (
                            <span style={{
                              padding: '0.25rem 0.5rem',
                              background: '#0369a1',
                              color: '#ffffff',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              textTransform: 'uppercase'
                            }}>
                              Primary
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleTogglePrimary(dx.id, true)}
                              disabled={isLocked}
                              style={{
                                padding: '0.25rem 0.5rem',
                                background: '#f3f4f6',
                                color: '#6b7280',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                cursor: isLocked ? 'not-allowed' : 'pointer',
                                opacity: isLocked ? 0.6 : 1
                              }}
                            >
                              Set Primary
                            </button>
                          )}
                        </td>
                        <td>
                          {isAiSuggestion && (
                            <button
                              type="button"
                              onClick={() => handleConfirmAiDiagnosis(dx)}
                              disabled={isLocked}
                              style={{
                                padding: '0.25rem 0.5rem',
                                background: '#ecfdf5',
                                color: '#047857',
                                border: '1px solid #86efac',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                cursor: isLocked ? 'not-allowed' : 'pointer',
                                opacity: isLocked ? 0.6 : 1,
                                marginRight: '0.35rem',
                                fontWeight: 700,
                              }}
                            >
                              Confirm
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteDiagnosis(dx.id)}
                            disabled={isLocked}
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: '#fee2e2',
                              color: '#dc2626',
                              border: '1px solid #fca5a5',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              cursor: isLocked ? 'not-allowed' : 'pointer',
                              opacity: isLocked ? 0.6 : 1
                            }}
                          >
                            Delete
                          </button>
                        </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Procedures/Charges Section */}
            <div className="ema-form-section" style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <div className="ema-section-header">Billing</div>
                  <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '0.15rem' }}>
                    Charge-code based lines split by insurance claim vs patient responsibility.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowPerformedWorkModal(true)}
                    disabled={isNew || isLocked}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#0f766e',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      fontWeight: 600,
                      cursor: isNew || isLocked ? 'not-allowed' : 'pointer',
                      opacity: isNew || isLocked ? 0.6 : 1,
                      fontSize: '0.875rem'
                    }}
                  >
                    + Performed Work
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowProcedureModal(true)}
                    disabled={isNew || isLocked}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#0369a1',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      fontWeight: 500,
                      cursor: isNew || isLocked ? 'not-allowed' : 'pointer',
                      opacity: isNew || isLocked ? 0.6 : 1,
                      fontSize: '0.875rem'
                    }}
                  >
                    + Add Charge Code
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInventoryUsageModal(true)}
                    disabled={isNew || isLocked || !inventoryProviderId}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#7c3aed',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      fontWeight: 500,
                      cursor: isNew || isLocked || !inventoryProviderId ? 'not-allowed' : 'pointer',
                      opacity: isNew || isLocked || !inventoryProviderId ? 0.6 : 1,
                      fontSize: '0.875rem'
                    }}
                  >
                    + Add Used Items
                  </button>
                </div>
              </div>

              {charges.length === 0 ? (
                <div style={{
                  background: '#f9fafb',
                  border: '1px dashed #d1d5db',
                  borderRadius: '8px',
                  padding: '2rem',
                  textAlign: 'center',
                  color: '#6b7280'
                }}>
                  No charges added yet. Click "Performed Work" for quick capture or "Add Charge Code" to search CPT, HCPCS, and self-pay service codes.
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    <button type="button" className="btn-secondary" onClick={() => setShowProcedureModal(true)} disabled={isLocked}>
                      Edit Charges
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setShowProcedureModal(true)} disabled={isLocked}>
                      Override Suggested E/M Code
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setShowProcedureModal(true)} disabled={isLocked}>
                      Bill by Time
                    </button>
                  </div>
                  {renderChargeSheet(
                    'Insurable Charges',
                    'CPT/HCPCS lines that need diagnosis support and can flow to insurance claims.',
                    insuranceCharges,
                    '#0369a1',
                    'No insurance-routed charges on this encounter.',
                  )}
                  {renderChargeSheet(
                    'Patient Responsible Charges',
                    'Self-pay, cosmetic, or non-covered services that stay patient-responsible by default.',
                    patientResponsibleCharges,
                    '#7c3aed',
                    'No patient-responsible charges on this encounter.',
                  )}
                </div>
              )}
            </div>

            {!isNew && encounterId && (
              <div className="ema-form-section" style={{ marginBottom: '2rem' }}>
                <InventoryUsageList
                  encounterId={encounterId}
                  onOpenUsageModal={() => setShowInventoryUsageModal(true)}
                />
              </div>
            )}

            {/* Charge Summary */}
            {charges.length > 0 && (
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: '8px',
                padding: '1.5rem'
              }}>
                <h4 style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#065f46',
                  marginBottom: '1rem'
                }}>
                  Charge Summary
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#047857', marginBottom: '0.25rem' }}>
                      Total Procedures
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#065f46' }}>
                      {charges.reduce((sum, c) => sum + (c.quantity || 1), 0)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#047857', marginBottom: '0.25rem' }}>
                      Total Charges
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#065f46' }}>
                      ${(charges.reduce((sum, c) => sum + getChargeTotalCents(c), 0) / 100).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#047857', marginBottom: '0.25rem' }}>
                      Insurance Total
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0c4a6e' }}>
                      ${(insuranceChargesTotalCents / 100).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#047857', marginBottom: '0.25rem' }}>
                      Self-Pay Total
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#6d28d9' }}>
                      ${(selfPayChargesTotalCents / 100).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Vitals Modal */}
      <Modal isOpen={showVitalsModal} title="Record Vitals" onClose={() => setShowVitalsModal(false)}>
        <div className="modal-form">
          <div className="form-row">
            <div className="form-field">
              <label>BP Systolic</label>
              <input
                type="number"
                value={vitalsForm.bpSystolic}
                onChange={(e) => setVitalsForm((prev) => ({ ...prev, bpSystolic: e.target.value }))}
                placeholder="120"
              />
            </div>
            <div className="form-field">
              <label>BP Diastolic</label>
              <input
                type="number"
                value={vitalsForm.bpDiastolic}
                onChange={(e) => setVitalsForm((prev) => ({ ...prev, bpDiastolic: e.target.value }))}
                placeholder="80"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Pulse (bpm)</label>
              <input
                type="number"
                value={vitalsForm.pulse}
                onChange={(e) => setVitalsForm((prev) => ({ ...prev, pulse: e.target.value }))}
                placeholder="72"
              />
            </div>
            <div className="form-field">
              <label>Temp (°C)</label>
              <input
                type="number"
                step="0.1"
                value={vitalsForm.tempC}
                onChange={(e) => setVitalsForm((prev) => ({ ...prev, tempC: e.target.value }))}
                placeholder="37.0"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Height (cm)</label>
              <input
                type="number"
                value={vitalsForm.heightCm}
                onChange={(e) => setVitalsForm((prev) => ({ ...prev, heightCm: e.target.value }))}
                placeholder="175"
              />
            </div>
            <div className="form-field">
              <label>Weight (kg)</label>
              <input
                type="number"
                step="0.1"
                value={vitalsForm.weightKg}
                onChange={(e) => setVitalsForm((prev) => ({ ...prev, weightKg: e.target.value }))}
                placeholder="70"
              />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowVitalsModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSaveVitals}>
            Save Vitals
          </button>
        </div>
      </Modal>

      {/* Order Modal */}
      <Modal isOpen={showOrderModal} title="Add Order" onClose={() => setShowOrderModal(false)}>
        <div className="modal-form">
          <div className="form-field">
            <label>Order Type</label>
            <select
              value={orderForm.type}
              onChange={(e) => setOrderForm((prev) => ({ ...prev, type: e.target.value }))}
            >
              <option value="lab">Lab</option>
              <option value="imaging">Imaging</option>
              <option value="procedure">Procedure</option>
              <option value="biopsy">Biopsy</option>
              <option value="referral">Referral</option>
            </select>
          </div>
          <div className="form-field">
            <label>Details</label>
            <textarea
              value={orderForm.details}
              onChange={(e) => setOrderForm((prev) => ({ ...prev, details: e.target.value }))}
              placeholder="Order details..."
              rows={4}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowOrderModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleAddOrder}>
            Add Order
          </button>
        </div>
      </Modal>

      {/* Diagnosis Search Modal */}
      <DiagnosisSearchModal
        isOpen={showDiagnosisModal}
        onClose={() => setShowDiagnosisModal(false)}
        onSelect={handleAddDiagnosis}
        providerId={(encounter.providerId as string | undefined) || undefined}
        patientDiagnoses={patientDiagnosisHistory}
        currentDiagnoses={diagnoses}
        defaultPrimary={!diagnoses.some((diagnosis) => diagnosis.isPrimary)}
        contextText={diagnosisSuggestionContext}
      />

      {/* Procedure Search Modal */}
      <ProcedureSearchModal
        isOpen={showProcedureModal}
        onClose={() => setShowProcedureModal(false)}
        onSelect={handleAddProcedure}
        diagnoses={diagnoses}
      />

      <PerformedWorkModal
        isOpen={showPerformedWorkModal}
        onClose={() => setShowPerformedWorkModal(false)}
        diagnoses={diagnoses}
        onRecord={handleRecordPerformedWork}
      />

      {!isNew && patientId && (
        <InventoryUsageModal
          isOpen={showInventoryUsageModal}
          onClose={() => setShowInventoryUsageModal(false)}
          encounterId={encounterId}
          appointmentId={encounter.appointmentId || undefined}
          patientId={patientId}
          providerId={inventoryProviderId}
          onSuccess={() => {
            loadData();
            if ((window as any).__refreshInventoryUsage) {
              (window as any).__refreshInventoryUsage();
            }
          }}
        />
      )}

      {/* Sign & Lock Modal */}
      <Modal isOpen={showSignModal} title="Sign & Lock Encounter" onClose={() => setShowSignModal(false)}>
        <div style={{ padding: '1rem 0' }}>
          <div style={{
            background: '#fef3c7',
            border: '1px solid #fbbf24',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            gap: '0.75rem'
          }}>
            <span style={{ fontSize: '1.25rem' }}></span>
            <div style={{ fontSize: '0.875rem' }}>
              <div style={{ fontWeight: 600, color: '#92400e', marginBottom: '0.25rem' }}>
                Important: This action cannot be undone
              </div>
              <div style={{ color: '#78350f' }}>
                By signing this encounter, you attest that all documentation is accurate and complete.
                Once signed, this encounter will be locked and cannot be edited.
              </div>
            </div>
          </div>

          <div style={{
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1.5rem'
          }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '1rem' }}>
              Encounter Summary
            </h3>
            <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                <span style={{ color: '#6b7280' }}>Patient:</span>
                <span style={{ fontWeight: 500 }}>{patient?.lastName}, {patient?.firstName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                <span style={{ color: '#6b7280' }}>Date:</span>
                <span>{encounter.createdAt ? new Date(encounter.createdAt).toLocaleDateString() : 'Today'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                <span style={{ color: '#6b7280' }}>Chief Complaint:</span>
                <span style={{ maxWidth: '60%', textAlign: 'right' }}>
                  {encounter.chiefComplaint || <em style={{ color: '#ef4444' }}>Not documented</em>}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                <span style={{ color: '#6b7280' }}>HPI:</span>
                <span>{encounter.hpi ? 'Documented' : <em style={{ color: '#f59e0b' }}>Empty</em>}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                <span style={{ color: '#6b7280' }}>Physical Exam:</span>
                <span>{encounter.exam ? 'Documented' : <em style={{ color: '#f59e0b' }}>Empty</em>}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                <span style={{ color: '#6b7280' }}>Assessment & Plan:</span>
                <span>{encounter.assessmentPlan ? 'Documented' : <em style={{ color: '#f59e0b' }}>Empty</em>}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                <span style={{ color: '#6b7280' }}>Lesions Documented:</span>
                <span style={{ fontWeight: 500 }}>{bodyDiagramLesionCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                <span style={{ color: '#6b7280' }}>Orders Placed:</span>
                <span style={{ fontWeight: 500 }}>{orders.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7280' }}>Vitals Recorded:</span>
                <span style={{ fontWeight: 500 }}>{vitals ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowSignModal(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-success"
            onClick={handleSign}
            disabled={saving}
            style={{ background: '#10b981', color: '#ffffff', fontWeight: 600 }}
          >
            {saving ? 'Signing...' : (encounter.appointmentId ? 'Sign & Send to Checkout' : 'Sign & Lock Encounter')}
          </button>
        </div>
      </Modal>

      {/* AI Draft Modal */}
      <Modal
        isOpen={showAiDraftModal}
        title="AI Note Draft"
        onClose={() => {
          setShowAiDraftModal(false);
          setAiDraftResult(null);
          setAiDraftError(null);
        }}
        size="lg"
      >
        <div className="modal-form">
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
            Generate a structured note draft using AI. Review and edit before signing.
          </p>
          <div className="form-field">
            <label>Chief Complaint</label>
            <input
              type="text"
              value={aiDraftInput.chiefComplaint}
              onChange={(e) => setAiDraftInput((prev) => ({ ...prev, chiefComplaint: e.target.value }))}
              placeholder="e.g., itchy rash, changing mole"
              disabled={aiDraftLoading}
            />
          </div>
          <div className="form-field">
            <label htmlFor="ai-template-select">Template (optional)</label>
            <select
              id="ai-template-select"
              value={aiTemplateId}
              onChange={(e) => setAiTemplateId(e.target.value)}
              disabled={aiTemplateLoading || aiDraftLoading}
            >
              <option value="">No template</option>
              {aiTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.category})
                </option>
              ))}
            </select>
            {aiTemplateLoading && (
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Loading templates...
              </div>
            )}
            {aiTemplateError && (
              <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem' }}>
                {aiTemplateError}
              </div>
            )}
            {!aiTemplateLoading && !aiTemplateError && aiTemplates.length === 0 && (
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                No templates yet. Create them in Note Templates.
              </div>
            )}
          </div>
          <div className="form-field">
            <label>Brief Notes for AI</label>
            <textarea
              value={aiDraftInput.briefNotes}
              onChange={(e) => setAiDraftInput((prev) => ({ ...prev, briefNotes: e.target.value }))}
              placeholder="Key symptoms, onset, treatments tried, exam highlights..."
              rows={4}
              disabled={aiDraftLoading}
            />
          </div>
          {aiDraftError && (
            <div style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              {aiDraftError}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleGenerateAiDraft}
              disabled={aiDraftLoading}
            >
              {aiDraftLoading ? 'Generating...' : aiDraftResult ? 'Regenerate Draft' : 'Generate Draft'}
            </button>
          </div>
        </div>

        {aiDraftResult && (
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', marginTop: '1rem' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              Draft Preview (Confidence: {Math.round((aiDraftResult.confidenceScore || 0) * 100)}%)
            </div>
            <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.875rem' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>Chief Complaint</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{aiDraftResult.chiefComplaint || '—'}</div>
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>HPI</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{aiDraftResult.hpi || '—'}</div>
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>ROS</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{aiDraftResult.ros || '—'}</div>
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>Exam</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{aiDraftResult.exam || '—'}</div>
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>Assessment & Plan</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{aiDraftResult.assessmentPlan || '—'}</div>
              </div>
            </div>

            {aiDraftResult.suggestions?.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>Suggestions</div>
                <ul style={{ paddingLeft: '1.25rem', margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
                  {aiDraftResult.suggestions.slice(0, 5).map((suggestion, idx) => (
                    <li key={`${suggestion.section}-${idx}`}>
                      {suggestion.section}: {suggestion.suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowAiDraftModal(false);
              setAiDraftResult(null);
              setAiDraftError(null);
            }}
          >
            Close
          </button>
          {aiDraftResult && (
            <>
              <button type="button" className="btn-secondary" onClick={() => applyAiDraft('merge')}>
                Merge Draft
              </button>
              <button type="button" className="btn-primary" onClick={() => applyAiDraft('replace')}>
                Apply Draft
              </button>
            </>
          )}
        </div>
      </Modal>

      {/* Template Selector Modal */}
      {session && (
        <TemplateSelector
          isOpen={showTemplateSelector}
          onClose={() => setShowTemplateSelector(false)}
          onApply={handleApplyTemplate}
          tenantId={session.tenantId}
          accessToken={session.accessToken}
        />
      )}
    </div>
  );
}
