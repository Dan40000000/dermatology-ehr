import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchNotes,
  fetchProviders,
  fetchPatients,
  bulkFinalizeNotes,
  bulkAssignNotes,
  signNote,
  addNoteAddendum,
  fetchNoteAddendums,
  type Note,
} from '../api';

export function NotesPage() {
  const { user, accessToken, tenantId } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'draft' | 'preliminary' | 'final' | 'signed' | 'all'>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [patientFilter, setPatientFilter] = useState<string>('all');

  // Bulk operations
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());

  // Modals
  const [signModalNote, setSignModalNote] = useState<Note | null>(null);
  const [addendumModalNote, setAddendumModalNote] = useState<Note | null>(null);
  const [addendumText, setAddendumText] = useState<string>('');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignToProviderId, setAssignToProviderId] = useState<string>('');
  const [viewNoteModal, setViewNoteModal] = useState<Note | null>(null);
  const [addendums, setAddendums] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, [statusFilter, providerFilter, startDate, endDate, patientFilter]);

  const loadData = async () => {
    if (!tenantId || !accessToken) return;

    setLoading(true);
    setError(null);

    try {
      const filters: any = {};
      if (statusFilter !== 'all') filters.status = statusFilter;
      if (providerFilter !== 'all') filters.providerId = providerFilter;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (patientFilter !== 'all') filters.patientId = patientFilter;

      const [notesRes, providersRes, patientsRes] = await Promise.all([
        fetchNotes(tenantId, accessToken, filters),
        fetchProviders(tenantId, accessToken),
        fetchPatients(tenantId, accessToken),
      ]);

      setNotes(notesRes.notes || []);
      setProviders(providersRes.providers || []);
      setPatients(patientsRes.patients || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectNote = (noteId: string) => {
    const newSelection = new Set(selectedNotes);
    if (newSelection.has(noteId)) {
      newSelection.delete(noteId);
    } else {
      newSelection.add(noteId);
    }
    setSelectedNotes(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedNotes.size === notes.length) {
      setSelectedNotes(new Set());
    } else {
      setSelectedNotes(new Set(notes.map((n) => n.id)));
    }
  };

  const handleBulkFinalize = async () => {
    if (!tenantId || !accessToken || selectedNotes.size === 0) return;

    setLoading(true);
    setError(null);

    try {
      const result = await bulkFinalizeNotes(tenantId, accessToken, Array.from(selectedNotes));
      setSuccess(result.message);
      setSelectedNotes(new Set());
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to finalize notes');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAssign = async () => {
    if (!tenantId || !accessToken || selectedNotes.size === 0 || !assignToProviderId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await bulkAssignNotes(
        tenantId,
        accessToken,
        Array.from(selectedNotes),
        assignToProviderId
      );
      setSuccess(result.message);
      setSelectedNotes(new Set());
      setAssignModalOpen(false);
      setAssignToProviderId('');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to assign notes');
    } finally {
      setLoading(false);
    }
  };

  const handleSignNote = async () => {
    if (!tenantId || !accessToken || !signModalNote) return;

    setLoading(true);
    setError(null);

    try {
      const result = await signNote(tenantId, accessToken, signModalNote.id);
      setSuccess(result.message);
      setSignModalNote(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to sign note');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAddendum = async () => {
    if (!tenantId || !accessToken || !addendumModalNote || !addendumText.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const result = await addNoteAddendum(tenantId, accessToken, addendumModalNote.id, addendumText);
      setSuccess(result.message);
      setAddendumModalNote(null);
      setAddendumText('');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to add addendum');
    } finally {
      setLoading(false);
    }
  };

  const handleViewNote = async (note: Note) => {
    setViewNoteModal(note);
    if (note.status === 'signed' && tenantId && accessToken) {
      try {
        const addendumRes = await fetchNoteAddendums(tenantId, accessToken, note.id);
        setAddendums(addendumRes.addendums || []);
      } catch (err) {
        console.error('Failed to load addendums:', err);
        setAddendums([]);
      }
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-200 text-gray-800';
      case 'preliminary':
        return 'bg-blue-200 text-blue-800';
      case 'final':
        return 'bg-green-200 text-green-800';
      case 'signed':
        return 'bg-purple-200 text-purple-800';
      default:
        return 'bg-gray-200 text-gray-800';
    }
  };

  const filteredNotes = notes;

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem', color: '#1e1147' }}>
          Note Management
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          Manage clinical notes with advanced filtering, bulk operations, and signing workflow
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '1rem',
            background: '#fee2e2',
            color: '#dc2626',
            borderRadius: '8px',
            marginBottom: '1rem',
            fontSize: '0.875rem',
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {success && (
        <div
          style={{
            padding: '1rem',
            background: '#d1fae5',
            color: '#059669',
            borderRadius: '8px',
            marginBottom: '1rem',
            fontSize: '0.875rem',
          }}
        >
          {success}
          <button
            onClick={() => setSuccess(null)}
            style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter Panel */}
      <div
        style={{
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="preliminary">Preliminary</option>
              <option value="final">Final</option>
              <option value="signed">Signed</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
              Provider
            </label>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
            >
              <option value="all">All Providers</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
              Patient
            </label>
            <select
              value={patientFilter}
              onChange={(e) => setPatientFilter(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
            >
              <option value="all">All Patients</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
            />
          </div>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={loadData}
            style={{
              padding: '0.5rem 1rem',
              background: '#6B46C1',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            Apply Filters
          </button>
          <button
            onClick={() => {
              setStatusFilter('all');
              setProviderFilter('all');
              setPatientFilter('all');
              setStartDate('');
              setEndDate('');
            }}
            style={{
              padding: '0.5rem 1rem',
              background: 'white',
              color: '#6B46C1',
              border: '1px solid #6B46C1',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Bulk Operations */}
      {selectedNotes.size > 0 && (
        <div
          style={{
            background: '#ede9fe',
            border: '1px solid #c4b5fd',
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#6B46C1' }}>
            {selectedNotes.size} note{selectedNotes.size !== 1 ? 's' : ''} selected
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleBulkFinalize}
              disabled={loading}
              style={{
                padding: '0.5rem 1rem',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
                opacity: loading ? 0.6 : 1,
              }}
            >
              Finalize Selected
            </button>
            <button
              onClick={() => setAssignModalOpen(true)}
              disabled={loading}
              style={{
                padding: '0.5rem 1rem',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
                opacity: loading ? 0.6 : 1,
              }}
            >
              Assign Selected
            </button>
            <button
              onClick={() => setSelectedNotes(new Set())}
              style={{
                padding: '0.5rem 1rem',
                background: 'white',
                color: '#6B46C1',
                border: '1px solid #6B46C1',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Notes Table */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>
                  <input
                    type="checkbox"
                    checked={selectedNotes.size === notes.length && notes.length > 0}
                    onChange={handleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                  Patient
                </th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                  Provider
                </th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                  Chief Complaint
                </th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                  Visit Code
                </th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                  Status
                </th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                  Date
                </th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && notes.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
                    Loading notes...
                  </td>
                </tr>
              ) : filteredNotes.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
                    No notes found
                  </td>
                </tr>
              ) : (
                filteredNotes.map((note) => (
                  <tr key={note.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <input
                        type="checkbox"
                        checked={selectedNotes.has(note.id)}
                        onChange={() => handleSelectNote(note.id)}
                        disabled={note.status === 'signed'}
                        style={{ cursor: note.status === 'signed' ? 'not-allowed' : 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#111827' }}>
                      {note.patientLastName}, {note.patientFirstName}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#111827' }}>
                      {note.providerName}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#111827' }}>
                      {note.chiefComplaint || '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#111827' }}>
                      {note.visitCode || '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                        }}
                        className={getStatusBadgeColor(note.status)}
                      >
                        {note.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      {new Date(note.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleViewNote(note)}
                          style={{
                            padding: '0.25rem 0.75rem',
                            background: '#f3f4f6',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#374151',
                          }}
                        >
                          View
                        </button>
                        {note.status !== 'signed' && (
                          <button
                            onClick={() => setSignModalNote(note)}
                            style={{
                              padding: '0.25rem 0.75rem',
                              background: '#6B46C1',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            Sign
                          </button>
                        )}
                        {note.status === 'signed' && (
                          <button
                            onClick={() => setAddendumModalNote(note)}
                            style={{
                              padding: '0.25rem 0.75rem',
                              background: '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            Addendum
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sign Note Modal */}
      {signModalNote && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setSignModalNote(null)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '500px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem', color: '#1e1147' }}>
              Sign Note
            </h2>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              Are you sure you want to sign this note? Once signed, the note will be locked and cannot be edited.
              Only addendums can be added to signed notes.
            </p>
            <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Patient:</div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                {signModalNote.patientLastName}, {signModalNote.patientFirstName}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.75rem', marginBottom: '0.5rem' }}>Chief Complaint:</div>
              <div style={{ fontSize: '1rem', color: '#111827' }}>
                {signModalNote.chiefComplaint || 'None'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSignModalNote(null)}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'white',
                  color: '#6B46C1',
                  border: '1px solid #6B46C1',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSignNote}
                disabled={loading}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#6B46C1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? 'Signing...' : 'Sign Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Addendum Modal */}
      {addendumModalNote && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => {
            setAddendumModalNote(null);
            setAddendumText('');
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '600px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem', color: '#1e1147' }}>
              Add Addendum
            </h2>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              Add an addendum to this signed note. The addendum will be timestamped and attributed to you.
            </p>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                Addendum Text
              </label>
              <textarea
                value={addendumText}
                onChange={(e) => setAddendumText(e.target.value)}
                rows={6}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem',
                  resize: 'vertical',
                }}
                placeholder="Enter addendum text..."
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setAddendumModalNote(null);
                  setAddendumText('');
                }}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'white',
                  color: '#6B46C1',
                  border: '1px solid #6B46C1',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddAddendum}
                disabled={loading || !addendumText.trim()}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading || !addendumText.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  opacity: loading || !addendumText.trim() ? 0.6 : 1,
                }}
              >
                {loading ? 'Adding...' : 'Add Addendum'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {assignModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => {
            setAssignModalOpen(false);
            setAssignToProviderId('');
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '500px',
              width: '90%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem', color: '#1e1147' }}>
              Assign Notes to Provider
            </h2>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              Assign {selectedNotes.size} selected note{selectedNotes.size !== 1 ? 's' : ''} to a provider
            </p>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                Select Provider
              </label>
              <select
                value={assignToProviderId}
                onChange={(e) => setAssignToProviderId(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
              >
                <option value="">Choose a provider...</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setAssignModalOpen(false);
                  setAssignToProviderId('');
                }}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'white',
                  color: '#6B46C1',
                  border: '1px solid #6B46C1',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAssign}
                disabled={loading || !assignToProviderId}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading || !assignToProviderId ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  opacity: loading || !assignToProviderId ? 0.6 : 1,
                }}
              >
                {loading ? 'Assigning...' : 'Assign Notes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Note Modal */}
      {viewNoteModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            overflow: 'auto',
          }}
          onClick={() => {
            setViewNoteModal(null);
            setAddendums([]);
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '800px',
              width: '90%',
              maxHeight: '90vh',
              overflow: 'auto',
              margin: '2rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem', color: '#1e1147' }}>
              Clinical Note
            </h2>

            {/* Header Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Patient</div>
                <div style={{ fontWeight: 600, color: '#111827' }}>
                  {viewNoteModal.patientLastName}, {viewNoteModal.patientFirstName}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Provider</div>
                <div style={{ fontWeight: 600, color: '#111827' }}>{viewNoteModal.providerName}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Status</div>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                  className={getStatusBadgeColor(viewNoteModal.status)}
                >
                  {viewNoteModal.status}
                </span>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Visit Code</div>
                <div style={{ fontWeight: 600, color: '#111827' }}>{viewNoteModal.visitCode || '—'}</div>
              </div>
            </div>

            {/* Note Content */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                  Chief Complaint
                </h3>
                <p style={{ color: '#111827', whiteSpace: 'pre-wrap' }}>
                  {viewNoteModal.chiefComplaint || 'None documented'}
                </p>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                  HPI (History of Present Illness)
                </h3>
                <p style={{ color: '#111827', whiteSpace: 'pre-wrap' }}>
                  {viewNoteModal.hpi || 'None documented'}
                </p>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                  ROS (Review of Systems)
                </h3>
                <p style={{ color: '#111827', whiteSpace: 'pre-wrap' }}>
                  {viewNoteModal.ros || 'None documented'}
                </p>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                  Physical Exam
                </h3>
                <p style={{ color: '#111827', whiteSpace: 'pre-wrap' }}>
                  {viewNoteModal.exam || 'None documented'}
                </p>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                  Assessment & Plan
                </h3>
                <p style={{ color: '#111827', whiteSpace: 'pre-wrap' }}>
                  {viewNoteModal.assessmentPlan || 'None documented'}
                </p>
              </div>

              {/* Addendums */}
              {viewNoteModal.status === 'signed' && addendums.length > 0 && (
                <div style={{ marginTop: '2rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#374151' }}>
                    Addendums
                  </h3>
                  {addendums.map((addendum) => (
                    <div
                      key={addendum.id}
                      style={{
                        background: '#fef3c7',
                        border: '1px solid #fbbf24',
                        borderRadius: '8px',
                        padding: '1rem',
                        marginBottom: '1rem',
                      }}
                    >
                      <div style={{ fontSize: '0.75rem', color: '#92400e', marginBottom: '0.5rem' }}>
                        Added by {addendum.addedByName || addendum.addedBy} on{' '}
                        {new Date(addendum.createdAt).toLocaleString()}
                      </div>
                      <p style={{ color: '#111827', whiteSpace: 'pre-wrap' }}>{addendum.addendumText}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setViewNoteModal(null);
                  setAddendums([]);
                }}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#6B46C1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
