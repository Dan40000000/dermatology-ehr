import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal } from '../components/ui';
import { PatientBanner, TemplateSelector } from '../components/clinical';
import { PatientBodyDiagram, type BodyMarker } from '../components/body-diagram';
import { DiagnosisSearchModal, ProcedureSearchModal } from '../components/billing';
import { InventoryUsageList, InventoryUsageModal } from '../components/inventory';
import { EncounterPrescriptions } from '../components/prescriptions';
import { ScribePanel } from '../components/ScribePanel';
import {
  fetchPatients,
  fetchEncounters,
  createEncounter,
  updateEncounter,
  updateEncounterStatus,
  updateAppointmentStatus,
  checkOutFrontDeskAppointment,
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
  generateAiNoteDraft,
  fetchNoteTemplates,
  fetchProviders,
  fetchEncounterAmbientNotes,
} from '../api';
import type { Patient, Encounter, Vitals, Order, EncounterDiagnosis, Charge, ICD10Code, CPTCode } from '../types';
import type { NoteTemplate, AINoteDraft, AmbientGeneratedNote } from '../api';
import { useAutosave } from '../hooks/useAutosave';
import { ScribeSummaryCard } from '../components/ScribeSummaryCard';
import { clearActiveEncounter, setActiveEncounter } from '../utils/activeEncounter';
import {
  buildConcerns,
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
  const [charges, setCharges] = useState<Charge[]>([]);
  const [scribeNote, setScribeNote] = useState<AmbientGeneratedNote | null>(null);
  const [scribeNoteLoading, setScribeNoteLoading] = useState(false);

  // Check if encounter is locked/read-only
  const isLocked = encounter.status === 'signed' || encounter.status === 'locked';

  const [activeSection, setActiveSection] = useState<EncounterSection>('note');
  const [bodyDiagramMarkers, setBodyDiagramMarkers] = useState<BodyMarker[]>([]);

  // Modals
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [showDiagnosisModal, setShowDiagnosisModal] = useState(false);
  const [showProcedureModal, setShowProcedureModal] = useState(false);
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
      const [patientsRes, encountersRes, providersRes] = await Promise.all([
        fetchPatients(session.tenantId, session.accessToken),
        fetchEncounters(session.tenantId, session.accessToken),
        fetchProviders(session.tenantId, session.accessToken),
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

  // Sign encounter
  const handleSign = async () => {
    if (!session || !encounterId || isNew) return;

    setSaving(true);
    try {
      // First save any pending changes
      await updateEncounter(session.tenantId, session.accessToken, encounterId, {
        chiefComplaint: encounter.chiefComplaint ?? '',
        hpi: encounter.hpi ?? '',
        ros: encounter.ros ?? '',
        exam: encounter.exam ?? '',
        assessmentPlan: encounter.assessmentPlan ?? '',
      });

      // Then update status to signed (locked)
      await updateEncounterStatus(session.tenantId, session.accessToken, encounterId, 'signed');

      showSuccess('Encounter signed and locked');
      setShowSignModal(false);
      clearActiveEncounter();
      navigate(`/patients/${patientId}`);
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
      try {
        await checkOutFrontDeskAppointment(session.tenantId, session.accessToken, encounter.appointmentId);
      } catch {
        // Fallback for non-front-desk roles
        await updateAppointmentStatus(session.tenantId, session.accessToken, encounter.appointmentId, 'completed');
      }
      showSuccess('Appointment ended');
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

  // Add procedure/charge
  const handleAddProcedure = async (procedure: {
    code: string;
    description: string;
    quantity: number;
    feeCents: number;
    linkedDiagnosisIds: string[];
  }) => {
    if (!session || !encounterId || isNew) return;

    try {
      await createCharge(session.tenantId, session.accessToken, {
        encounterId,
        cptCode: procedure.code,
        description: procedure.description,
        quantity: procedure.quantity,
        feeCents: procedure.feeCents,
        linkedDiagnosisIds: procedure.linkedDiagnosisIds,
        amountCents: procedure.feeCents * procedure.quantity,
      });
      showSuccess('Charge added');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to add charge');
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
            Sign & Lock
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
              : (isLaserVisit ? 'Complete Laser Visit' : 'End Appointment')}
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
                concerns={buildConcerns(scribeNote)}
                potentialDiagnoses={buildDiagnoses(scribeNote, null)}
                suggestedTests={buildTests(scribeNote, null)}
                summaryText={buildSummaryText(scribeNote, null)}
                summaryLabel="Summary of Appointment"
                showDetails
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
                  <span>🗺️</span>
                  Full Body Diagram
                </button>
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
            {/* Auto-Suggest Panel */}
            {!isNew && !isLocked && (
              <div style={{
                background: '#e0f2fe',
                border: '1px solid #0369a1',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1.5rem'
              }}>
                <h4 style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#0369a1',
                  marginBottom: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span>💡</span>
                  Suggested Procedures (Based on Documentation)
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {bodyDiagramLesionCount > 0 && !charges.find(c => c.cptCode === '11100') && (
                    <button
                      type="button"
                      onClick={() => setShowProcedureModal(true)}
                      style={{
                        padding: '0.5rem 0.75rem',
                        background: '#ffffff',
                        border: '1px solid #0369a1',
                        borderRadius: '4px',
                        color: '#0369a1',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      <span>11100</span>
                      <span>-</span>
                      <span>Biopsy (lesions documented)</span>
                    </button>
                  )}
                  {encounter.exam && !charges.find(c => c.cptCode.startsWith('992')) && (
                    <button
                      type="button"
                      onClick={() => setShowProcedureModal(true)}
                      style={{
                        padding: '0.5rem 0.75rem',
                        background: '#ffffff',
                        border: '1px solid #0369a1',
                        borderRadius: '4px',
                        color: '#0369a1',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      <span>99213</span>
                      <span>-</span>
                      <span>Office Visit E&M</span>
                    </button>
                  )}
                  {(encounter.exam?.toLowerCase().includes('cryotherapy') || encounter.exam?.toLowerCase().includes('destruction')) && !charges.find(c => c.cptCode === '17000') && (
                    <button
                      type="button"
                      onClick={() => setShowProcedureModal(true)}
                      style={{
                        padding: '0.5rem 0.75rem',
                        background: '#ffffff',
                        border: '1px solid #0369a1',
                        borderRadius: '4px',
                        color: '#0369a1',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      <span>17000</span>
                      <span>-</span>
                      <span>Destruction/Cryotherapy</span>
                    </button>
                  )}
                  {(encounter.exam?.toLowerCase().includes('excision') || encounter.exam?.toLowerCase().includes('excised')) && !charges.find(c => c.cptCode === '11400') && (
                    <button
                      type="button"
                      onClick={() => setShowProcedureModal(true)}
                      style={{
                        padding: '0.5rem 0.75rem',
                        background: '#ffffff',
                        border: '1px solid #0369a1',
                        borderRadius: '4px',
                        color: '#0369a1',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      <span>11400</span>
                      <span>-</span>
                      <span>Excision</span>
                    </button>
                  )}
                </div>
                {bodyDiagramLesionCount === 0 && !encounter.exam && (
                  <p style={{ fontSize: '0.75rem', color: '#075985', margin: 0 }}>
                    Complete documentation to see procedure suggestions
                  </p>
                )}
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

            {charges.some(c => !c.linkedDiagnosisIds || c.linkedDiagnosisIds.length === 0) && (
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
                  <strong>Warning:</strong> Some procedures are not linked to diagnoses. CMS requires all procedures to be linked to at least one diagnosis.
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
                    {diagnoses.map((dx) => (
                      <tr key={dx.id}>
                        <td style={{ fontWeight: 600, color: '#0369a1' }}>{dx.icd10Code}</td>
                        <td>{dx.description}</td>
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
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Procedures/Charges Section */}
            <div className="ema-form-section" style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div className="ema-section-header">Procedures & Charges (CPT)</div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
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
                    + Add Procedure
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
                    + Record Inventory
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
                  No procedures added yet. Click "Add Procedure" to start.
                </div>
              ) : (
                <table className="ema-table">
                  <thead>
                    <tr>
                      <th style={{ width: '100px' }}>CPT Code</th>
                      <th>Description</th>
                      <th style={{ width: '80px' }}>Qty</th>
                      <th style={{ width: '100px' }}>Fee</th>
                      <th style={{ width: '100px' }}>Total</th>
                      <th style={{ width: '200px' }}>Linked DX</th>
                      <th style={{ width: '100px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {charges.map((charge) => (
                      <tr key={charge.id}>
                        <td style={{ fontWeight: 600, color: '#0369a1' }}>{charge.cptCode}</td>
                        <td>{charge.description}</td>
                        <td style={{ textAlign: 'center' }}>{charge.quantity || 1}</td>
                        <td style={{ textAlign: 'right' }}>
                          ${((charge.feeCents || 0) / 100).toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          ${(((charge.feeCents || 0) * (charge.quantity || 1)) / 100).toFixed(2)}
                        </td>
                        <td>
                          {charge.linkedDiagnosisIds && charge.linkedDiagnosisIds.length > 0 ? (
                            <div style={{ fontSize: '0.75rem' }}>
                              {charge.linkedDiagnosisIds.map(dxId => {
                                const dx = diagnoses.find(d => d.id === dxId);
                                return dx ? (
                                  <div key={dxId} style={{ marginBottom: '0.25rem' }}>
                                    {dx.icd10Code}
                                  </div>
                                ) : null;
                              })}
                            </div>
                          ) : (
                            <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>None</span>
                          )}
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
                    ))}
                  </tbody>
                </table>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
                      ${(charges.reduce((sum, c) => sum + ((c.feeCents || 0) * (c.quantity || 1)), 0) / 100).toFixed(2)}
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
      />

      {/* Procedure Search Modal */}
      <ProcedureSearchModal
        isOpen={showProcedureModal}
        onClose={() => setShowProcedureModal(false)}
        onSelect={handleAddProcedure}
        diagnoses={diagnoses}
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
            {saving ? 'Signing...' : 'Sign & Lock Encounter'}
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
