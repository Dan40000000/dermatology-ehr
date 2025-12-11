import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, Modal, ExportButtons } from '../components/ui';
import type { ExportColumn } from '../utils/export';
import { formatDate as formatExportDate, formatPhone } from '../utils/export';
import { Calendar } from '../components/schedule/Calendar';
import { AppointmentModal, type AppointmentFormData } from '../components/schedule/AppointmentModal';
import {
  fetchAppointments,
  fetchProviders,
  fetchLocations,
  fetchAppointmentTypes,
  fetchAvailability,
  fetchPatients,
  updateAppointmentStatus,
  createAppointment,
  rescheduleAppointment,
} from '../api';
import type { Appointment, Provider, Location, AppointmentType, Availability, Patient, ConflictInfo } from '../types';

export function SchedulePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);

  // Schedule state
  const [dayOffset, setDayOffset] = useState(() => {
    const stored = Number(localStorage.getItem('sched:dayOffset') || 0);
    return Number.isNaN(stored) ? 0 : stored;
  });
  const [viewMode, setViewMode] = useState<'day' | 'week'>(() =>
    (localStorage.getItem('sched:viewMode') as 'day' | 'week') || 'day'
  );
  const [providerFilter, setProviderFilter] = useState(() => localStorage.getItem('sched:provider') || 'all');
  const [typeFilter, setTypeFilter] = useState(() => localStorage.getItem('sched:type') || 'all');
  const [locationFilter, setLocationFilter] = useState('all');

  const [overlaps, setOverlaps] = useState<ConflictInfo[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<any[]>([]);

  // Modal states
  const [showNewApptModal, setShowNewApptModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showTimeBlockModal, setShowTimeBlockModal] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [creating, setCreating] = useState(false);

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

  // Reschedule form
  const [rescheduleData, setRescheduleData] = useState({
    date: '',
    time: '09:00',
  });

  // Time block form
  const [timeBlockData, setTimeBlockData] = useState({
    providerId: '',
    title: '',
    blockType: 'blocked' as 'blocked' | 'lunch' | 'meeting' | 'admin' | 'continuing_education' | 'out_of_office',
    description: '',
    date: '',
    startTime: '09:00',
    endTime: '10:00',
    isRecurring: false,
    recurrencePattern: 'weekly' as 'daily' | 'weekly' | 'biweekly' | 'monthly',
    recurrenceEndDate: '',
  });

  // Save filter state
  useEffect(() => {
    localStorage.setItem('sched:provider', providerFilter);
    localStorage.setItem('sched:type', typeFilter);
    localStorage.setItem('sched:dayOffset', String(dayOffset));
    localStorage.setItem('sched:viewMode', viewMode);
  }, [providerFilter, typeFilter, dayOffset, viewMode]);

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const [apptRes, provRes, locRes, typeRes, availRes, patRes, timeBlocksRes] = await Promise.all([
        fetchAppointments(session.tenantId, session.accessToken),
        fetchProviders(session.tenantId, session.accessToken),
        fetchLocations(session.tenantId, session.accessToken),
        fetchAppointmentTypes(session.tenantId, session.accessToken),
        fetchAvailability(session.tenantId, session.accessToken),
        fetchPatients(session.tenantId, session.accessToken),
        fetch(`${import.meta.env.VITE_API_URL}/api/time-blocks`, {
          headers: {
            'Authorization': `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }).then(r => r.json()).catch(() => []),
      ]);
      setAppointments(apptRes.appointments || []);
      setProviders(provRes.providers || []);
      setLocations(locRes.locations || []);
      setAppointmentTypes(typeRes.appointmentTypes || []);
      setAvailability(availRes.availability || []);
      setPatients(patRes.patients || []);
      setTimeBlocks(Array.isArray(timeBlocksRes) ? timeBlocksRes : []);
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Conflict detection
  useEffect(() => {
    const grouped = new Map<string, any[]>();
    appointments.forEach((appt) => {
      const list = grouped.get(appt.providerId) || [];
      list.push(appt);
      grouped.set(appt.providerId, list);
    });

    const conflictMap = new Map<string, { provider: string; time: string; count: number; patients: Set<string> }>();
    grouped.forEach((list) => {
      const sorted = list.sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];
        const start = new Date(current.scheduledStart).getTime();
        const end = new Date(current.scheduledEnd).getTime();
        const nextStart = new Date(next.scheduledStart).getTime();
        if (start < nextStart && end > nextStart) {
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

  const handleCreateAppointment = async (formData: AppointmentFormData) => {
    if (!session) return;

    const startDate = new Date(`${formData.date}T${formData.time}:00`);
    const endDate = new Date(startDate.getTime() + formData.duration * 60000);

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

  const handleReschedule = async () => {
    if (!session || !selectedAppt) return;
    if (!rescheduleData.date) {
      showError('Please select a new date');
      return;
    }

    setCreating(true);
    try {
      const originalDuration = new Date(selectedAppt.scheduledEnd).getTime() - new Date(selectedAppt.scheduledStart).getTime();
      const newStart = new Date(`${rescheduleData.date}T${rescheduleData.time}:00`);
      const newEnd = new Date(newStart.getTime() + originalDuration);

      await rescheduleAppointment(
        session.tenantId,
        session.accessToken,
        selectedAppt.id,
        newStart.toISOString(),
        newEnd.toISOString()
      );

      showSuccess('Appointment rescheduled');
      setShowRescheduleModal(false);
      setSelectedAppt(null);
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to reschedule');
    } finally {
      setCreating(false);
    }
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
    const date = new Date(appt.scheduledStart);
    setRescheduleData({
      date: date.toISOString().split('T')[0],
      time: date.toTimeString().slice(0, 5),
    });
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

  const handleCreateTimeBlock = async () => {
    if (!session) return;
    if (!timeBlockData.providerId || !timeBlockData.title || !timeBlockData.date) {
      showError('Please fill in all required fields');
      return;
    }

    setCreating(true);
    try {
      const startDateTime = new Date(`${timeBlockData.date}T${timeBlockData.startTime}:00`);
      const endDateTime = new Date(`${timeBlockData.date}T${timeBlockData.endTime}:00`);

      await fetch(`${import.meta.env.VITE_API_URL}/api/time-blocks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
        body: JSON.stringify({
          providerId: timeBlockData.providerId,
          title: timeBlockData.title,
          blockType: timeBlockData.blockType,
          description: timeBlockData.description || null,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          isRecurring: timeBlockData.isRecurring,
          recurrencePattern: timeBlockData.isRecurring ? timeBlockData.recurrencePattern : null,
          recurrenceEndDate: timeBlockData.isRecurring && timeBlockData.recurrenceEndDate
            ? timeBlockData.recurrenceEndDate
            : null,
        }),
      });

      showSuccess('Time block created successfully');
      setShowTimeBlockModal(false);
      setTimeBlockData({
        providerId: '',
        title: '',
        blockType: 'blocked',
        description: '',
        date: '',
        startTime: '09:00',
        endTime: '10:00',
        isRecurring: false,
        recurrencePattern: 'weekly',
        recurrenceEndDate: '',
      });
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to create time block');
    } finally {
      setCreating(false);
    }
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
    <div className="schedule-page">
      {/* Action Buttons Row */}
      <div className="ema-action-bar">
        <button type="button" className="ema-action-btn" onClick={() => {
          console.log('New Appointment button clicked');
          setShowNewApptModal(true);
        }}>
          <span className="icon">📅</span>
          New Appointment
        </button>
        <button
          type="button"
          className="ema-action-btn"
          disabled={!selectedAppt}
          onClick={() => selectedAppt && openRescheduleModal(selectedAppt)}
        >
          <span className="icon">🔄</span>
          Reschedule
        </button>
        <button
          type="button"
          className="ema-action-btn"
          disabled={!selectedAppt}
          onClick={() => selectedAppt && handleCancelAppt(selectedAppt)}
        >
          <span className="icon">❌</span>
          Cancel Appointment
        </button>
        <button
          type="button"
          className="ema-action-btn"
          disabled={!selectedAppt}
          onClick={() => selectedAppt && handleCheckIn(selectedAppt)}
        >
          <span className="icon">✅</span>
          Check In
        </button>
        <button type="button" className="ema-action-btn" onClick={() => setShowTimeBlockModal(true)}>
          <span className="icon">🚫</span>
          Time Block
        </button>
        <button type="button" className="ema-action-btn" onClick={loadData}>
          <span className="icon">🔃</span>
          Refresh
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
            <label className="ema-filter-label">Provider</label>
            <select
              className="ema-filter-select"
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
            >
              <option value="all">All Providers</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.fullName}</option>
              ))}
            </select>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Appointment Type</label>
            <select
              className="ema-filter-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
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
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
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
                onClick={() => setDayOffset((d) => d - 1)}
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
                onClick={() => setDayOffset((d) => d + 1)}
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
                onClick={() => setViewMode('day')}
              >
                Day
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'week' ? 'active' : ''}`}
                onClick={() => setViewMode('week')}
              >
                Week
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
          <span style={{ fontWeight: 600, color: '#92400e' }}>⚠️ Scheduling Conflicts:</span>
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

      {/* Calendar Grid */}
      {loading ? (
        <div style={{ padding: '2rem' }}>
          <Skeleton variant="card" height={600} />
        </div>
      ) : (
        <Calendar
          currentDate={currentDate}
          viewMode={viewMode}
          appointments={appointments.filter((a) => {
            const typeOk = typeFilter === 'all' || a.appointmentTypeId === typeFilter;
            const locationOk = locationFilter === 'all' || a.locationId === locationFilter;
            return typeOk && locationOk;
          })}
          providers={providers.filter((p) => providerFilter === 'all' || p.id === providerFilter)}
          availability={availability}
          selectedAppointment={selectedAppt}
          onAppointmentClick={setSelectedAppt}
          onSlotClick={handleSlotClick}
        />
      )}

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
                  <select
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.75rem',
                      borderRadius: '4px',
                      border: '1px solid #d1d5db'
                    }}
                    onChange={(e) => handleStatusChange(a.id, e.target.value)}
                    defaultValue=""
                  >
                    <option value="">Change Status</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="checked_in">Checked In</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
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
          providerId: newAppt.providerId,
          date: newAppt.date,
          time: newAppt.time,
        }}
      />

      {/* Reschedule Modal */}
      <Modal isOpen={showRescheduleModal} title="Reschedule Appointment" onClose={() => setShowRescheduleModal(false)}>
        {selectedAppt && (
          <div className="modal-form">
            <div style={{
              background: '#f9fafb',
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '1rem'
            }}>
              <div style={{ fontWeight: 500, marginBottom: '0.5rem' }}>Current Appointment</div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                <div>{selectedAppt.patientName}</div>
                <div>{selectedAppt.appointmentTypeName} with {selectedAppt.providerName}</div>
                <div>{new Date(selectedAppt.scheduledStart).toLocaleString()}</div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>New Date *</label>
                <input
                  type="date"
                  value={rescheduleData.date}
                  onChange={(e) => setRescheduleData(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label>New Time *</label>
                <select
                  value={rescheduleData.time}
                  onChange={(e) => setRescheduleData(prev => ({ ...prev, time: e.target.value }))}
                >
                  {Array.from({ length: 20 }).map((_, i) => {
                    const hour = 8 + Math.floor(i / 2);
                    const min = (i % 2) * 30;
                    const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
                    return <option key={time} value={time}>{time}</option>;
                  })}
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowRescheduleModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleReschedule} disabled={creating}>
            {creating ? 'Rescheduling...' : 'Reschedule'}
          </button>
        </div>
      </Modal>

      {/* Time Block Modal */}
      <Modal isOpen={showTimeBlockModal} title="Create Time Block" onClose={() => setShowTimeBlockModal(false)}>
        <div className="modal-form">
          <div className="form-row">
            <div className="form-field">
              <label>Provider *</label>
              <select
                value={timeBlockData.providerId}
                onChange={(e) => setTimeBlockData(prev => ({ ...prev, providerId: e.target.value }))}
              >
                <option value="">Select Provider</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.fullName}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Block Type *</label>
              <select
                value={timeBlockData.blockType}
                onChange={(e) => setTimeBlockData(prev => ({ ...prev, blockType: e.target.value as any }))}
              >
                <option value="blocked">Blocked</option>
                <option value="lunch">Lunch</option>
                <option value="meeting">Meeting</option>
                <option value="admin">Admin Time</option>
                <option value="continuing_education">Continuing Education</option>
                <option value="out_of_office">Out of Office</option>
              </select>
            </div>
          </div>

          <div className="form-field">
            <label>Title *</label>
            <input
              type="text"
              value={timeBlockData.title}
              onChange={(e) => setTimeBlockData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g., Lunch Break, Staff Meeting"
            />
          </div>

          <div className="form-field">
            <label>Description</label>
            <textarea
              value={timeBlockData.description}
              onChange={(e) => setTimeBlockData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Optional notes..."
              rows={2}
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Date *</label>
              <input
                type="date"
                value={timeBlockData.date}
                onChange={(e) => setTimeBlockData(prev => ({ ...prev, date: e.target.value }))}
              />
            </div>

            <div className="form-field">
              <label>Start Time *</label>
              <select
                value={timeBlockData.startTime}
                onChange={(e) => setTimeBlockData(prev => ({ ...prev, startTime: e.target.value }))}
              >
                {Array.from({ length: 24 }).map((_, i) => {
                  const hour = 6 + Math.floor(i / 2);
                  const min = (i % 2) * 30;
                  const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
                  return <option key={time} value={time}>{time}</option>;
                })}
              </select>
            </div>

            <div className="form-field">
              <label>End Time *</label>
              <select
                value={timeBlockData.endTime}
                onChange={(e) => setTimeBlockData(prev => ({ ...prev, endTime: e.target.value }))}
              >
                {Array.from({ length: 24 }).map((_, i) => {
                  const hour = 6 + Math.floor(i / 2);
                  const min = (i % 2) * 30;
                  const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
                  return <option key={time} value={time}>{time}</option>;
                })}
              </select>
            </div>
          </div>

          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={timeBlockData.isRecurring}
                onChange={(e) => setTimeBlockData(prev => ({ ...prev, isRecurring: e.target.checked }))}
              />
              Recurring
            </label>
          </div>

          {timeBlockData.isRecurring && (
            <div className="form-row">
              <div className="form-field">
                <label>Recurrence Pattern</label>
                <select
                  value={timeBlockData.recurrencePattern}
                  onChange={(e) => setTimeBlockData(prev => ({ ...prev, recurrencePattern: e.target.value as any }))}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div className="form-field">
                <label>End Date</label>
                <input
                  type="date"
                  value={timeBlockData.recurrenceEndDate}
                  onChange={(e) => setTimeBlockData(prev => ({ ...prev, recurrenceEndDate: e.target.value }))}
                />
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowTimeBlockModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleCreateTimeBlock} disabled={creating}>
            {creating ? 'Creating...' : 'Create Time Block'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
