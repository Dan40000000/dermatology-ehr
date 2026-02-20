import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal, ExportButtons } from '../components/ui';
import type { ExportColumn } from '../utils/export';
import { formatDate as formatExportDate, formatPhone } from '../utils/export';
import { Calendar } from '../components/schedule/Calendar';
import { AppointmentModal, type AppointmentFormData } from '../components/schedule/AppointmentModal';
import { TimeBlockModal, type TimeBlockFormData } from '../components/schedule/TimeBlockModal';
import { RescheduleModal, type RescheduleFormData } from '../components/schedule/RescheduleModal';
import {
  fetchAppointments,
  fetchProviders,
  fetchLocations,
  fetchAppointmentTypes,
  fetchAvailability,
  fetchPatients,
  updateAppointmentStatus,
  createAppointment,
  createEncounter,
  fetchPatientEncounters,
  rescheduleAppointment,
  fetchTimeBlocks,
  createTimeBlock,
  updateTimeBlock,
  deleteTimeBlock,
  type TimeBlock,
} from '../api';
import type { Appointment, Provider, Location, AppointmentType, Availability, Patient, ConflictInfo } from '../types';

export function SchedulePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const patientIdParam = searchParams.get('patientId');
  const appointmentIdParam = searchParams.get('appointmentId');
  const viewParam = searchParams.get('view');
  const handledQueryRef = useRef<{ patientId: string | null; appointmentId: string | null }>({
    patientId: null,
    appointmentId: null,
  });

  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);

  // Schedule state - Initialize from URL parameter or localStorage
  const [dayOffset, setDayOffset] = useState(() => {
    const stored = Number(localStorage.getItem('sched:dayOffset') || 0);
    return Number.isNaN(stored) ? 0 : stored;
  });

  // Initialize view mode from URL query parameter, fallback to localStorage, then 'day'
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>(() => {
    const urlView = searchParams.get('view');
    if (urlView === 'day' || urlView === 'week' || urlView === 'month') {
      return urlView;
    }
    const stored = localStorage.getItem('sched:viewMode');
    if (stored === 'day' || stored === 'week' || stored === 'month') {
      return stored as 'day' | 'week' | 'month';
    }
    return 'day';
  });
  const [providerFilter, setProviderFilter] = useState(() => localStorage.getItem('sched:provider') || 'all');
  const [typeFilter, setTypeFilter] = useState(() => localStorage.getItem('sched:type') || 'all');
  const [locationFilter, setLocationFilter] = useState('all');

  const [overlaps, setOverlaps] = useState<ConflictInfo[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);

  // Modal states
  const [showNewApptModal, setShowNewApptModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showTimeBlockModal, setShowTimeBlockModal] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [selectedTimeBlock, setSelectedTimeBlock] = useState<TimeBlock | null>(null);
  const [creating, setCreating] = useState(false);
  const [rowAction, setRowAction] = useState<{ id: string; action: 'encounter' | 'scribe' } | null>(null);

  // New appointment form
  const [newAppt, setNewAppt] = useState({
    patientId: '',
    providerId: '',
    appointmentTypeId: '',
    locationId: '',
    date: '',
    time: '09:00',
    duration: 30,
    notes: '',
  });

  // Appointment Finder states
  const [showAppointmentFinder, setShowAppointmentFinder] = useState(false);
  const [showExpandedFinder, setShowExpandedFinder] = useState(false);
  const [finderData, setFinderData] = useState({
    locations: '',
    providers: '',
    appointmentType: '',
    duration: '5',
    timePreference: 'Anytime',
    weekdayPreference: 'Any Day',
    schedulingPreference: 'First available',
    displayBy: 'By Provider',
  });

  // Reschedule form (legacy - keeping for compatibility)
  const [rescheduleData, setRescheduleData] = useState({
    date: '',
    time: '09:00',
  });

  // Time block initial data for when clicking a slot
  const [timeBlockInitialData, setTimeBlockInitialData] = useState<{
    providerId?: string;
    date?: string;
    startTime?: string;
  } | undefined>(undefined);

  // Sync view mode from URL query parameter changes when a valid view is present.
  // Do not force day when `view` is absent; that can race with localStorage-derived view.
  useEffect(() => {
    const isValidViewParam = viewParam === 'day' || viewParam === 'week' || viewParam === 'month';
    if (!isValidViewParam) return;
    setViewMode((prev) => (prev === viewParam ? prev : viewParam));
  }, [viewParam]);

  useEffect(() => {
    if (!appointmentIdParam || handledQueryRef.current.appointmentId === appointmentIdParam) return;
    if (appointments.length === 0) return;

    handledQueryRef.current.appointmentId = appointmentIdParam;
    const appointment = appointments.find((appt) => appt.id === appointmentIdParam);

    if (appointment) {
      setSelectedAppt(appointment);
      setShowRescheduleModal(true);
    } else {
      showError('Appointment not found');
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('appointmentId');
    setSearchParams(nextParams);
  }, [appointmentIdParam, appointments, searchParams, setSearchParams, showError]);

  useEffect(() => {
    if (!patientIdParam || appointmentIdParam) return;
    if (handledQueryRef.current.patientId === patientIdParam) return;

    handledQueryRef.current.patientId = patientIdParam;
    setNewAppt((prev) => ({ ...prev, patientId: patientIdParam }));
    setShowNewApptModal(true);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('patientId');
    setSearchParams(nextParams);
  }, [patientIdParam, appointmentIdParam, searchParams, setSearchParams]);

  // Auto-select first provider when switching to month view if "all" is selected
  useEffect(() => {
    if (viewMode === 'month' && providerFilter === 'all' && providers.length > 0) {
      setProviderFilter(providers[0].id);
    }
  }, [viewMode, providerFilter, providers]);

  // Save filter state
  useEffect(() => {
    localStorage.setItem('sched:provider', providerFilter);
    localStorage.setItem('sched:type', typeFilter);
    localStorage.setItem('sched:dayOffset', String(dayOffset));
    localStorage.setItem('sched:viewMode', viewMode);
  }, [providerFilter, typeFilter, dayOffset, viewMode]);

  const updateViewMode = useCallback((nextView: 'day' | 'week' | 'month') => {
    setViewMode(nextView);
    setSearchParams((prev) => {
      const nextParams = new URLSearchParams(prev);
      if (nextView === 'day') {
        nextParams.delete('view');
      } else {
        nextParams.set('view', nextView);
      }
      return nextParams;
    }, { replace: true });
  }, [setSearchParams]);

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      // Calculate date range based on view mode
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selectedDate = new Date();
      selectedDate.setDate(selectedDate.getDate() + dayOffset);
      selectedDate.setHours(0, 0, 0, 0);

      // Determine start and end dates based on view mode
      let startDate: Date;
      let endDate: Date;

      if (viewMode === 'month') {
        // For month view, get the first day of the selected month and extend to cover full month grid
        startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        // Go back to include previous month days that appear in calendar grid
        startDate.setDate(startDate.getDate() - 7);
        // End date is last day of month + some buffer for next month days in grid
        endDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
        endDate.setDate(endDate.getDate() + 14);
      } else {
        // For day/week view, start from today and end 60 days from selected date
        startDate = today;
        endDate = new Date(selectedDate);
        endDate.setDate(endDate.getDate() + 60);
      }

      const formatDate = (d: Date) => d.toISOString().split('T')[0];

      const [apptRes, provRes, locRes, typeRes, availRes, patRes, timeBlocksRes] = await Promise.all([
        fetchAppointments(session.tenantId, session.accessToken, {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
        }),
        fetchProviders(session.tenantId, session.accessToken),
        fetchLocations(session.tenantId, session.accessToken),
        fetchAppointmentTypes(session.tenantId, session.accessToken),
        fetchAvailability(session.tenantId, session.accessToken),
        fetchPatients(session.tenantId, session.accessToken),
        fetchTimeBlocks(session.tenantId, session.accessToken).catch(() => []),
      ]);
      setAppointments(apptRes.appointments || []);
      setProviders(provRes.providers || []);
      setLocations(locRes.locations || []);
      setAppointmentTypes(typeRes.appointmentTypes || []);
      setAvailability(availRes.availability || []);
      setPatients(patRes.data || patRes.patients || []);
      setTimeBlocks(Array.isArray(timeBlocksRes) ? timeBlocksRes : []);
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }, [session, showError, dayOffset, viewMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Conflict detection
  useEffect(() => {
    if (!Array.isArray(appointments) || appointments.length === 0) {
      setOverlaps([]);
      return;
    }

    // Filter out cancelled appointments
    const activeAppointments = appointments.filter(
      (appt) => appt && appt.status !== 'cancelled'
    );

    const grouped = new Map<string, any[]>();
    activeAppointments.forEach((appt) => {
      if (!appt || !appt.providerId) return;
      const list = grouped.get(appt.providerId) || [];
      list.push(appt);
      grouped.set(appt.providerId, list);
    });

    const conflictMap = new Map<string, { provider: string; time: string; count: number; patients: Set<string> }>();
    grouped.forEach((list) => {
      if (!Array.isArray(list) || list.length === 0) return;

      const sorted = list.sort((a, b) => {
        if (!a?.scheduledStart || !b?.scheduledStart) return 0;
        return new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime();
      });

      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];

        if (!current?.scheduledStart || !current?.scheduledEnd || !next?.scheduledStart || !next?.scheduledEnd) continue;

        const currentStart = new Date(current.scheduledStart).getTime();
        const currentEnd = new Date(current.scheduledEnd).getTime();
        const nextStart = new Date(next.scheduledStart).getTime();
        const nextEnd = new Date(next.scheduledEnd).getTime();

        if (isNaN(currentStart) || isNaN(currentEnd) || isNaN(nextStart) || isNaN(nextEnd)) continue;

        // Check for proper overlap: appointments overlap if one starts before the other ends AND vice versa
        if (currentStart < nextEnd && currentEnd > nextStart) {
          const providerName = current.providerName || 'Provider';
          const startLabel = new Date(current.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const key = `${providerName}-${startLabel}`;
          const existing = conflictMap.get(key) || { provider: providerName, time: startLabel, count: 0, patients: new Set<string>() };
          existing.count++;
          if (current.patientName) existing.patients.add(current.patientName);
          if (next.patientName) existing.patients.add(next.patientName);
          conflictMap.set(key, existing);
        }
      }
    });

    setOverlaps(Array.from(conflictMap.values()).map((c) => ({
      provider: c.provider,
      time: c.time,
      count: c.count,
      patients: Array.from(c.patients),
    })));
  }, [appointments]);

  const handleStatusChange = async (id: string, status: string) => {
    if (!session) return;
    try {
      await updateAppointmentStatus(session.tenantId, session.accessToken, id, status);
      showSuccess('Status updated');
      loadData();
    } catch (err: any) {
      showError(err.message);
    }
  };

  const ensureEncounterForAppointment = useCallback(async (appt: Appointment) => {
    if (!session) {
      throw new Error('Session missing');
    }
    const encountersRes = await fetchPatientEncounters(
      session.tenantId,
      session.accessToken,
      appt.patientId
    );
    const existing = (encountersRes.encounters || []).find((e: any) => e.appointmentId === appt.id);
    if (existing?.id) {
      return existing.id as string;
    }
    const created = await createEncounter(session.tenantId, session.accessToken, {
      patientId: appt.patientId,
      providerId: appt.providerId,
      appointmentId: appt.id,
    });
    return created.id as string;
  }, [session]);

  const handleStartEncounterFromSchedule = async (appt: Appointment, mode: 'encounter' | 'scribe') => {
    if (!session) return;
    try {
      setRowAction({ id: appt.id, action: mode });
      const encounterId = await ensureEncounterForAppointment(appt);
      if (appt.status !== 'completed' && appt.status !== 'cancelled' && appt.status !== 'in_progress') {
        try {
          await updateAppointmentStatus(session.tenantId, session.accessToken, appt.id, 'in_progress');
        } catch {
          // Don't block the workflow if status update fails
        }
      }
      if (mode === 'scribe') {
        navigate(`/patients/${appt.patientId}?scribe=1&auto=1&encounterId=${encounterId}&providerId=${appt.providerId}`);
      } else {
        navigate(`/patients/${appt.patientId}/encounter/${encounterId}`);
      }
    } catch (err: any) {
      showError(err.message || 'Failed to start encounter');
    } finally {
      setRowAction(null);
    }
  };

  const handleCreateAppointment = async (formData: AppointmentFormData) => {
    if (!session) return;

    const startDate = new Date(`${formData.date}T${formData.time}:00`);
    const endDate = new Date(startDate.getTime() + formData.duration * 60000);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      showError('Invalid date or time');
      return;
    }

    await createAppointment(session.tenantId, session.accessToken, {
      patientId: formData.patientId,
      providerId: formData.providerId,
      appointmentTypeId: formData.appointmentTypeId,
      locationId: formData.locationId || locations[0]?.id,
      scheduledStart: startDate.toISOString(),
      scheduledEnd: endDate.toISOString(),
      notes: formData.notes,
    });

    showSuccess('Appointment created successfully');
    loadData();
  };

  const handleReschedule = async (formData: RescheduleFormData) => {
    if (!session || !selectedAppt) return;

    if (!selectedAppt.scheduledEnd || !selectedAppt.scheduledStart) {
      showError('Invalid appointment data');
      return;
    }

    const originalDuration = new Date(selectedAppt.scheduledEnd).getTime() - new Date(selectedAppt.scheduledStart).getTime();
    const newStart = new Date(`${formData.date}T${formData.time}:00`);
    const newEnd = new Date(newStart.getTime() + originalDuration);

    if (isNaN(originalDuration) || isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
      showError('Invalid date or time');
      return;
    }

    // Pass providerId if it changed
    const newProviderId = formData.providerId !== selectedAppt.providerId ? formData.providerId : undefined;

    await rescheduleAppointment(
      session.tenantId,
      session.accessToken,
      selectedAppt.id,
      newStart.toISOString(),
      newEnd.toISOString(),
      newProviderId
    );

    showSuccess('Appointment rescheduled');
    setShowRescheduleModal(false);
    setSelectedAppt(null);
    loadData();
  };

  const handleCheckIn = async (appt: Appointment) => {
    await handleStatusChange(appt.id, 'checked_in');
  };

  const handleCancelAppt = async (appt: Appointment) => {
    if (window.confirm(`Cancel appointment for ${appt.patientName}?`)) {
      await handleStatusChange(appt.id, 'cancelled');
    }
  };

  const openRescheduleModal = (appt: Appointment) => {
    setSelectedAppt(appt);
    setShowRescheduleModal(true);
  };

  const handleSlotClick = (providerId: string, date: Date, hour: number, minute: number) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    const slotDate = new Date(date);
    slotDate.setHours(hour, minute, 0, 0);

    setNewAppt({
      ...newAppt,
      providerId: providerId,
      date: slotDate.toISOString().split('T')[0],
      time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
    });
    setShowNewApptModal(true);
  };

  const handleSaveTimeBlock = async (formData: TimeBlockFormData) => {
    if (!session) return;

    const startDateTime = new Date(`${formData.date}T${formData.startTime}:00`);
    const endDateTime = new Date(`${formData.date}T${formData.endTime}:00`);

    const timeBlockPayload = {
      providerId: formData.providerId,
      title: formData.title,
      blockType: formData.blockType,
      description: formData.description || undefined,
      startTime: startDateTime.toISOString(),
      endTime: endDateTime.toISOString(),
      isRecurring: formData.isRecurring,
      recurrencePattern: formData.isRecurring ? formData.recurrencePattern : undefined,
      recurrenceEndDate: formData.isRecurring && formData.recurrenceEndDate
        ? formData.recurrenceEndDate
        : undefined,
    };

    if (selectedTimeBlock) {
      // Update existing time block
      await updateTimeBlock(session.tenantId, session.accessToken, selectedTimeBlock.id, timeBlockPayload);
      showSuccess('Time block updated successfully');
    } else {
      // Create new time block
      await createTimeBlock(session.tenantId, session.accessToken, timeBlockPayload);
      showSuccess('Time block created successfully');
    }

    setShowTimeBlockModal(false);
    setSelectedTimeBlock(null);
    setTimeBlockInitialData(undefined);
    loadData();
  };

  const handleDeleteTimeBlock = async (timeBlockId: string) => {
    if (!session) return;

    await deleteTimeBlock(session.tenantId, session.accessToken, timeBlockId);
    showSuccess('Time block deleted successfully');
    setShowTimeBlockModal(false);
    setSelectedTimeBlock(null);
    loadData();
  };

  const handleTimeBlockClick = async (timeBlockId: string) => {
    const timeBlock = timeBlocks.find(tb => tb.id === timeBlockId);
    if (timeBlock) {
      setSelectedTimeBlock(timeBlock);
      setShowTimeBlockModal(true);
    }
  };

  const openNewTimeBlockModal = () => {
    setSelectedTimeBlock(null);
    setTimeBlockInitialData(undefined);
    setShowTimeBlockModal(true);
  };

  const currentDate = new Date();
  currentDate.setDate(currentDate.getDate() + dayOffset);
  const dateLabel = currentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="schedule-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Action Buttons Row */}
      <div className="ema-action-bar" style={{ background: 'linear-gradient(to bottom, #f9fafb 0%, #f3f4f6 100%)', borderBottom: '2px solid #e5e7eb', gap: '0.5rem', padding: '0.75rem 1.5rem' }}>
        <button
          type="button"
          className="ema-action-btn"
          onClick={() => {
            setShowNewApptModal(true);
          }}
          style={{
            background: 'linear-gradient(to bottom, #10b981 0%, #059669 100%)',
            color: '#ffffff',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            fontWeight: 500,
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>+</span>
          New Appointment
        </button>
        <button
          type="button"
          className="ema-action-btn"
          disabled={!selectedAppt}
          onClick={() => selectedAppt && openRescheduleModal(selectedAppt)}
          style={{
            background: selectedAppt ? 'linear-gradient(to bottom, #0284c7 0%, #0369a1 100%)' : '#e5e7eb',
            color: selectedAppt ? '#ffffff' : '#9ca3af',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: selectedAppt ? 'pointer' : 'not-allowed',
            fontWeight: 500,
            boxShadow: selectedAppt ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>📅</span>
          Reschedule
        </button>
        <button
          type="button"
          className="ema-action-btn"
          disabled={!selectedAppt}
          onClick={() => selectedAppt && handleCancelAppt(selectedAppt)}
          style={{
            background: selectedAppt ? 'linear-gradient(to bottom, #ef4444 0%, #dc2626 100%)' : '#e5e7eb',
            color: selectedAppt ? '#ffffff' : '#9ca3af',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: selectedAppt ? 'pointer' : 'not-allowed',
            fontWeight: 500,
            boxShadow: selectedAppt ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>✕</span>
          Cancel Appointment
        </button>
        <button
          type="button"
          className="ema-action-btn"
          disabled={!selectedAppt}
          onClick={() => selectedAppt && handleCheckIn(selectedAppt)}
          style={{
            background: selectedAppt ? 'linear-gradient(to bottom, #8b5cf6 0%, #7c3aed 100%)' : '#e5e7eb',
            color: selectedAppt ? '#ffffff' : '#9ca3af',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: selectedAppt ? 'pointer' : 'not-allowed',
            fontWeight: 500,
            boxShadow: selectedAppt ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>✓</span>
          Check In
        </button>
        <button
          type="button"
          className="ema-action-btn"
          disabled={!selectedAppt || rowAction?.id === selectedAppt?.id}
          onClick={() => selectedAppt && handleStartEncounterFromSchedule(selectedAppt, 'encounter')}
          style={{
            background: selectedAppt ? 'linear-gradient(to bottom, #10b981 0%, #059669 100%)' : '#e5e7eb',
            color: selectedAppt ? '#ffffff' : '#9ca3af',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: selectedAppt ? 'pointer' : 'not-allowed',
            fontWeight: 500,
            boxShadow: selectedAppt ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
            opacity: rowAction?.id === selectedAppt?.id ? 0.7 : 1
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>🩺</span>
          {rowAction?.id === selectedAppt?.id && rowAction?.action === 'encounter' ? 'Starting…' : 'Start Encounter'}
        </button>
        <button
          type="button"
          className="ema-action-btn"
          disabled={!selectedAppt || rowAction?.id === selectedAppt?.id}
          onClick={() => selectedAppt && handleStartEncounterFromSchedule(selectedAppt, 'scribe')}
          style={{
            background: selectedAppt ? 'linear-gradient(to bottom, #f59e0b 0%, #d97706 100%)' : '#e5e7eb',
            color: selectedAppt ? '#ffffff' : '#9ca3af',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: selectedAppt ? 'pointer' : 'not-allowed',
            fontWeight: 500,
            boxShadow: selectedAppt ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
            opacity: rowAction?.id === selectedAppt?.id ? 0.7 : 1
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>🎙️</span>
          {rowAction?.id === selectedAppt?.id && rowAction?.action === 'scribe' ? 'Starting…' : 'Start Scribe'}
        </button>
        <button
          type="button"
          className="ema-action-btn"
          onClick={openNewTimeBlockModal}
          style={{
            background: 'linear-gradient(to bottom, #ffffff 0%, #f3f4f6 100%)',
            border: '1px solid #d1d5db',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            color: '#374151',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            fontWeight: 500,
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>⏱</span>
          Time Block
        </button>
        <button
          type="button"
          className="ema-action-btn"
          onClick={() => navigate('/face-sheets')}
          style={{
            background: 'linear-gradient(to bottom, #ffffff 0%, #f3f4f6 100%)',
            border: '1px solid #d1d5db',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            color: '#374151',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            fontWeight: 500,
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>📄</span>
          Face Sheets
        </button>
        <button
          type="button"
          className="ema-action-btn"
          onClick={loadData}
          style={{
            background: 'linear-gradient(to bottom, #ffffff 0%, #f3f4f6 100%)',
            border: '1px solid #d1d5db',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            color: '#374151',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            fontWeight: 500,
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>↻</span>
          Refresh
        </button>
        <button
          type="button"
          className="ema-action-btn"
          onClick={() => setShowAppointmentFinder(!showAppointmentFinder)}
          style={{
            background: showAppointmentFinder ? 'linear-gradient(to bottom, #06b6d4 0%, #0891b2 100%)' : 'linear-gradient(to bottom, #ffffff 0%, #f3f4f6 100%)',
            border: showAppointmentFinder ? 'none' : '1px solid #d1d5db',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            color: showAppointmentFinder ? '#ffffff' : '#374151',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            fontWeight: 500,
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>🔍</span>
          Appointment Finder
        </button>
        <div style={{ marginLeft: 'auto' }}>
          <ExportButtons
            data={appointments}
            filename="Appointments"
            columns={[
              { key: 'scheduledStart', label: 'Date', format: (date) => formatExportDate(date, 'short') },
              { key: 'scheduledStart', label: 'Time', format: (date) => formatExportDate(date, 'time') },
              { key: 'patientName', label: 'Patient' },
              { key: 'providerName', label: 'Provider' },
              { key: 'appointmentTypeName', label: 'Type' },
              { key: 'locationName', label: 'Location' },
              { key: 'status', label: 'Status' },
            ] as ExportColumn[]}
            variant="dropdown"
            pdfOptions={{ title: 'Appointments Schedule', orientation: 'landscape' }}
            onExport={(type) => showSuccess(`Exported ${appointments.length} appointments as ${type.toUpperCase()}`)}
          />
        </div>
      </div>

      {/* Schedule Section Header */}
      <div className="ema-section-header">
        Schedule - {dateLabel}
      </div>

      {/* Filter Panel */}
      <div className="ema-filter-panel">
        <div className="ema-filter-row">
          <div className="ema-filter-group">
            <label className="ema-filter-label">
              Provider
              {viewMode === 'month' && (
                <span style={{ fontSize: '0.7rem', color: '#6b7280', marginLeft: '0.5rem' }}>
                  (Month view: single provider)
                </span>
              )}
            </label>
            <select
              className="ema-filter-select"
              name="providerFilter"
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              aria-label="Provider"
            >
              {viewMode !== 'month' && <option value="all">All Providers</option>}
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.fullName}</option>
              ))}
            </select>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Appointment Type</label>
            <select
              className="ema-filter-select"
              name="appointmentTypeFilter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Appointment Type"
            >
              <option value="all">All Types</option>
              {appointmentTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Location</label>
            <select
              className="ema-filter-select"
              name="locationFilter"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              aria-label="Location"
            >
              <option value="all">All Locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Date Navigation</label>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button
                type="button"
                className="ema-filter-btn secondary"
                onClick={() => {
                  if (viewMode === 'month') {
                    // Move back one month
                    const current = new Date();
                    current.setDate(current.getDate() + dayOffset);
                    current.setMonth(current.getMonth() - 1);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    current.setHours(0, 0, 0, 0);
                    const diffDays = Math.round((current.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    setDayOffset(diffDays);
                  } else if (viewMode === 'week') {
                    // Move back one week
                    setDayOffset((d) => d - 7);
                  } else {
                    // Move back one day
                    setDayOffset((d) => d - 1);
                  }
                }}
              >
                ◀ Prev
              </button>
              <button
                type="button"
                className="ema-filter-btn"
                onClick={() => setDayOffset(0)}
              >
                Today
              </button>
              <button
                type="button"
                className="ema-filter-btn secondary"
                onClick={() => {
                  if (viewMode === 'month') {
                    // Move forward one month
                    const current = new Date();
                    current.setDate(current.getDate() + dayOffset);
                    current.setMonth(current.getMonth() + 1);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    current.setHours(0, 0, 0, 0);
                    const diffDays = Math.round((current.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    setDayOffset(diffDays);
                  } else if (viewMode === 'week') {
                    // Move forward one week
                    setDayOffset((d) => d + 7);
                  } else {
                    // Move forward one day
                    setDayOffset((d) => d + 1);
                  }
                }}
              >
                Next ▶
              </button>
            </div>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">View</label>
            <div className="view-mode-toggle">
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'day' ? 'active' : ''}`}
                onClick={() => updateViewMode('day')}
              >
                Day
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'week' ? 'active' : ''}`}
                onClick={() => updateViewMode('week')}
              >
                Week
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'month' ? 'active' : ''}`}
                onClick={() => updateViewMode('month')}
              >
                Month
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Conflict Warning Strip */}
      {overlaps.length > 0 && (
        <div style={{
          background: '#fef3c7',
          borderLeft: '4px solid #f59e0b',
          padding: '0.75rem 1rem',
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          <span style={{ fontWeight: 600, color: '#92400e' }}>Scheduling Conflicts:</span>
          {overlaps.slice(0, 4).map((c, idx) => (
            <span
              key={idx}
              style={{
                background: '#ffffff',
                border: '1px solid #f59e0b',
                borderRadius: '4px',
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                color: '#92400e'
              }}
            >
              {c.provider} @ {c.time}
            </span>
          ))}
        </div>
      )}

      {/* Main Content with Sidebar */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Calendar Grid */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <div style={{ padding: '2rem' }}>
              <Skeleton variant="card" height={600} />
            </div>
          ) : (
            <Calendar
              currentDate={currentDate}
              viewMode={viewMode}
              appointments={appointments.filter((a) => {
                // Filter out cancelled appointments - they should not appear on the schedule
                if (a.status === 'cancelled') return false;
                const providerOk = providerFilter === 'all' || a.providerId === providerFilter;
                const typeOk = typeFilter === 'all' || a.appointmentTypeId === typeFilter;
                const locationOk = locationFilter === 'all' || a.locationId === locationFilter;
                return providerOk && typeOk && locationOk;
              })}
              providers={providers.filter((p) => providerFilter === 'all' || p.id === providerFilter)}
              availability={availability}
              timeBlocks={timeBlocks.filter((tb) => providerFilter === 'all' || tb.providerId === providerFilter)}
              selectedAppointment={selectedAppt}
              onAppointmentClick={setSelectedAppt}
              onSlotClick={handleSlotClick}
              onTimeBlockClick={handleTimeBlockClick}
            />
          )}
        </div>

        {/* Appointment Finder Sidebar */}
        {showAppointmentFinder && (
          <div style={{
            width: '320px',
            background: 'linear-gradient(to bottom, #f0f9ff 0%, #e0f2fe 100%)',
            borderLeft: '2px solid #0284c7',
            padding: '1.5rem',
            overflowY: 'auto',
            boxShadow: '-4px 0 12px rgba(0,0,0,0.08)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#075985' }}>
                Appointment Finder
              </h3>
              <button
                onClick={() => setShowExpandedFinder(true)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  color: '#0284c7',
                  fontWeight: 500,
                  textDecoration: 'underline',
                }}
              >
                Quick Filters
              </button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Locations</label>
              <select
                name="finderLocations"
                value={finderData.locations}
                onChange={(e) => setFinderData({ ...finderData, locations: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #bae6fd',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  background: '#ffffff',
                }}
              >
                <option value="">Any Location</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Providers</label>
              <select
                name="finderProviders"
                value={finderData.providers}
                onChange={(e) => setFinderData({ ...finderData, providers: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #bae6fd',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  background: '#ffffff',
                }}
              >
                <option value="">Any Provider</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id}>{p.fullName}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                Appointment Type <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                name="finderAppointmentType"
                value={finderData.appointmentType}
                onChange={(e) => setFinderData({ ...finderData, appointmentType: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #bae6fd',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  background: '#ffffff',
                }}
              >
                <option value="">Click to select...</option>
                {appointmentTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                Duration <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                name="finderDuration"
                value={finderData.duration}
                onChange={(e) => setFinderData({ ...finderData, duration: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #bae6fd',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  background: '#ffffff',
                }}
              >
                <option value="5">5 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                Time Preference <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                name="finderTimePreference"
                value={finderData.timePreference}
                onChange={(e) => setFinderData({ ...finderData, timePreference: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #bae6fd',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  background: '#ffffff',
                }}
              >
                <option value="Anytime">Anytime</option>
                <option value="Morning">Morning</option>
                <option value="Afternoon">Afternoon</option>
                <option value="Evening">Evening</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Weekday Preference</label>
              <select
                name="finderWeekdayPreference"
                value={finderData.weekdayPreference}
                onChange={(e) => setFinderData({ ...finderData, weekdayPreference: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #bae6fd',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  background: '#ffffff',
                }}
              >
                <option value="Any Day">Any Day</option>
                <option value="Weekdays">Weekdays Only</option>
                <option value="Weekends">Weekends Only</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                Scheduling Preference <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                name="finderSchedulingPreference"
                value={finderData.schedulingPreference}
                onChange={(e) => setFinderData({ ...finderData, schedulingPreference: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #bae6fd',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  background: '#ffffff',
                }}
              >
                <option value="First available">First available</option>
                <option value="Specific date">Specific date</option>
              </select>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Display Options</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                  <input
                    type="radio"
                    name="displayBy"
                    value="By Provider"
                    checked={finderData.displayBy === 'By Provider'}
                    onChange={(e) => setFinderData({ ...finderData, displayBy: e.target.value })}
                  />
                  By Provider
                </label>
                <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                  <input
                    type="radio"
                    name="displayBy"
                    value="By Time Availability"
                    checked={finderData.displayBy === 'By Time Availability'}
                    onChange={(e) => setFinderData({ ...finderData, displayBy: e.target.value })}
                  />
                  By Time Availability
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => {
                  setFinderData({
                    locations: '',
                    providers: '',
                    appointmentType: '',
                    duration: '5',
                    timePreference: 'Anytime',
                    weekdayPreference: 'Any Day',
                    schedulingPreference: 'First available',
                    displayBy: 'By Provider',
                  });
                }}
                style={{
                  flex: 1,
                  padding: '0.625rem',
                  background: '#ffffff',
                  border: '1px solid #0284c7',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#0284c7',
                }}
              >
                Close
              </button>
              <button
                onClick={() => {
                  if (!finderData.appointmentType) {
                    showError('Please select an appointment type');
                    return;
                  }
                  showSuccess('Searching for available appointments...');
                }}
                style={{
                  flex: 1,
                  padding: '0.625rem',
                  background: 'linear-gradient(to bottom, #0284c7 0%, #0369a1 100%)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#ffffff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                Search
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Appointments Table */}
      <div className="ema-section-header">Appointments List</div>

      <table className="ema-table">
        <thead>
          <tr>
            <th style={{ width: '40px' }}></th>
            <th>Time</th>
            <th>Patient</th>
            <th>Provider</th>
            <th>Type</th>
            <th>Location</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                Loading...
              </td>
            </tr>
          ) : appointments.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                No appointments scheduled
              </td>
            </tr>
          ) : (
            appointments.map((a) => (
              <tr
                key={a.id}
                style={{
                  background: selectedAppt?.id === a.id ? '#e0f2fe' : undefined,
                  cursor: 'pointer'
                }}
                onClick={() => setSelectedAppt(a)}
              >
                <td>
                  <input
                    type="radio"
                    name="selectedAppt"
                    checked={selectedAppt?.id === a.id}
                    onChange={() => setSelectedAppt(a)}
                    aria-label={`Select appointment for ${a.patientName}`}
                  />
                </td>
                <td>
                  {new Date(a.scheduledStart).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </td>
                <td>
                  <a
                    href="#"
                    className="ema-patient-link"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(`/patients/${a.patientId}`);
                    }}
                  >
                    {a.patientName}
                  </a>
                </td>
                <td>{a.providerName}</td>
                <td>{a.appointmentTypeName}</td>
                <td>{a.locationName}</td>
                <td>
                  <span className={`ema-status ${a.status === 'completed' ? 'established' : a.status === 'cancelled' ? 'inactive' : 'pending'}`}>
                    {a.status}
                  </span>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => navigate(`/patients/${a.patientId}`)}
                        title="Open patient chart"
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5f5',
                          background: '#eef2ff',
                          color: '#1e3a8a',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Chart
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartEncounterFromSchedule(a, 'encounter')}
                        disabled={rowAction?.id === a.id}
                        title="Start or resume encounter"
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid #d1fae5',
                          background: '#ecfdf5',
                          color: '#065f46',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: rowAction?.id === a.id ? 'not-allowed' : 'pointer',
                          opacity: rowAction?.id === a.id ? 0.6 : 1
                        }}
                      >
                        {rowAction?.id === a.id && rowAction?.action === 'encounter' ? 'Starting…' : 'Encounter'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartEncounterFromSchedule(a, 'scribe')}
                        disabled={rowAction?.id === a.id}
                        title="Start AI scribe"
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid #fde68a',
                          background: '#fffbeb',
                          color: '#92400e',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: rowAction?.id === a.id ? 'not-allowed' : 'pointer',
                          opacity: rowAction?.id === a.id ? 0.6 : 1
                        }}
                      >
                        {rowAction?.id === a.id && rowAction?.action === 'scribe' ? 'Starting…' : 'Scribe'}
                      </button>
                    </div>
                    <select
                      name={`appointmentStatus-${a.id}`}
                      style={{
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db'
                      }}
                      onChange={(e) => handleStatusChange(a.id, e.target.value)}
                      defaultValue=""
                      aria-label={`Change status for ${a.patientName}`}
                    >
                      <option value="">Change Status</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="checked_in">Checked In</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* New Appointment Modal */}
      <AppointmentModal
        isOpen={showNewApptModal}
        onClose={() => setShowNewApptModal(false)}
        onSave={handleCreateAppointment}
        patients={patients}
        providers={providers}
        locations={locations}
        appointmentTypes={appointmentTypes}
        initialData={{
          patientId: newAppt.patientId,
          providerId: newAppt.providerId,
          locationId: newAppt.locationId,
          date: newAppt.date,
          time: newAppt.time,
        }}
      />

      {/* Reschedule Modal */}
      <RescheduleModal
        isOpen={showRescheduleModal}
        onClose={() => setShowRescheduleModal(false)}
        onSave={handleReschedule}
        appointment={selectedAppt}
        providers={providers}
        availability={availability}
        appointments={appointments}
      />

      {/* Time Block Modal */}
      <TimeBlockModal
        isOpen={showTimeBlockModal}
        onClose={() => {
          setShowTimeBlockModal(false);
          setSelectedTimeBlock(null);
          setTimeBlockInitialData(undefined);
        }}
        onSave={handleSaveTimeBlock}
        onDelete={handleDeleteTimeBlock}
        providers={providers}
        timeBlock={selectedTimeBlock}
        initialData={timeBlockInitialData}
      />

      {/* Expanded Appointment Finder Modal */}
      <Modal
        isOpen={showExpandedFinder}
        title="Expanded Appointment Finder"
        onClose={() => setShowExpandedFinder(false)}
      >
        <div style={{ padding: '1rem', minWidth: '600px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
            {/* 1st Appointment Column */}
            <div>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 600, color: '#075985', borderBottom: '2px solid #0284c7', paddingBottom: '0.5rem' }}>
                1st Appointment
              </h4>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                  Appointment Type <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  name="firstAppointmentType"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="">Click to select...</option>
                  {appointmentTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Locations</label>
                <select
                  name="firstLocations"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="">Any Location</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Providers</label>
                <select
                  name="firstProviders"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="">Any Provider</option>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>{p.fullName}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                  Duration <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  name="firstDuration"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="5">5 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                  Time Preference <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  name="firstTimePreference"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="Anytime">Anytime</option>
                  <option value="Morning">Morning</option>
                  <option value="Afternoon">Afternoon</option>
                  <option value="Evening">Evening</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Weekday Preference</label>
                <select
                  name="firstWeekdayPreference"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="Any Day">Any Day</option>
                  <option value="Weekdays">Weekdays Only</option>
                  <option value="Weekends">Weekends Only</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                  Scheduling Preference <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  name="firstSchedulingPreference"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="First available">First available</option>
                  <option value="Specific date">Specific date</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Display Options</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                    <input type="radio" name="display1" value="By Provider" defaultChecked />
                    By Provider
                  </label>
                  <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                    <input type="radio" name="display1" value="By Time Availability" />
                    By Time Availability
                  </label>
                </div>
              </div>

              <button
                onClick={() => showSuccess('Searching for 1st appointment...')}
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  background: 'linear-gradient(to bottom, #0284c7 0%, #0369a1 100%)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#ffffff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                Search 1st Appt
              </button>
            </div>

            {/* 2nd Appointment Column */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid #0284c7', paddingBottom: '0.5rem' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#075985' }}>
                  2nd Appointment
                </h4>
                <button
                  onClick={() => navigate('/appointment-finder')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    color: '#0284c7',
                    fontWeight: 500,
                    textDecoration: 'underline',
                  }}
                >
                  Quick Filters
                </button>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <input type="checkbox" name="secondAfterFirstAppointment" />
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                  After 1st Appointment <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>ℹ️</span>
                </span>
              </label>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                  Appointment Type <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  name="secondAppointmentType"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="">Click to select...</option>
                  {appointmentTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Locations</label>
                <select
                  name="secondLocations"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="">Any Location</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Providers</label>
                <select
                  name="secondProviders"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="">Any Provider</option>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>{p.fullName}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                  Duration <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  name="secondDuration"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="5">5 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                  Time Preference <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  name="secondTimePreference"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="Anytime">Anytime</option>
                  <option value="Morning">Morning</option>
                  <option value="Afternoon">Afternoon</option>
                  <option value="Evening">Evening</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Weekday Preference</label>
                <select
                  name="secondWeekdayPreference"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="Any Day">Any Day</option>
                  <option value="Weekdays">Weekdays Only</option>
                  <option value="Weekends">Weekends Only</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                  Scheduling Preference <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  name="secondSchedulingPreference"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="First available">First available</option>
                  <option value="Specific date">Specific date</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Display Options</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                    <input type="radio" name="display2" value="By Provider" defaultChecked />
                    By Provider
                  </label>
                  <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                    <input type="radio" name="display2" value="By Time Availability" />
                    By Time Availability
                  </label>
                </div>
              </div>

              <button
                onClick={() => showSuccess('Searching for 2nd appointment...')}
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  background: 'linear-gradient(to bottom, #0284c7 0%, #0369a1 100%)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#ffffff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                Search 2nd Appt
              </button>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowExpandedFinder(false)}
              style={{
                padding: '0.625rem 1.5rem',
                background: '#ffffff',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#374151',
              }}
            >
              Close
            </button>
            <button
              onClick={() => {
                showSuccess('Searching all appointments...');
                setShowExpandedFinder(false);
              }}
              style={{
                padding: '0.625rem 1.5rem',
                background: 'linear-gradient(to bottom, #0284c7 0%, #0369a1 100%)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#ffffff',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              Search All
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
