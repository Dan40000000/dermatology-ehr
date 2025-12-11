import { useState, useEffect } from 'react';
import { Modal } from '../ui';
import type { Task, TaskCategory, TaskPriority, TaskStatus, Patient } from '../../types';

interface TaskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TaskFormData) => Promise<void>;
  task?: Task;
  patients: Patient[];
  users: Array<{ id: string; fullName: string }>;
}

export interface TaskFormData {
  title: string;
  description: string;
  category: TaskCategory | '';
  priority: TaskPriority;
  status: TaskStatus;
  patientId: string;
  assignedTo: string;
  dueDate: string;
}

const TASK_CATEGORIES: Array<{ value: TaskCategory; label: string }> = [
  { value: 'patient-followup', label: 'Patient Follow-up' },
  { value: 'prior-auth', label: 'Prior Authorization' },
  { value: 'lab-path-followup', label: 'Lab/Path Follow-up' },
  { value: 'prescription-refill', label: 'Prescription Refill' },
  { value: 'insurance-verification', label: 'Insurance Verification' },
  { value: 'general', label: 'General' },
];

export function TaskFormModal({ isOpen, onClose, onSubmit, task, patients, users }: TaskFormModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<TaskFormData>({
    title: '',
    description: '',
    category: '',
    priority: 'normal',
    status: 'todo',
    patientId: '',
    assignedTo: '',
    dueDate: '',
  });

  useEffect(() => {
    if (task) {
      setForm({
        title: task.title,
        description: task.description || '',
        category: task.category || '',
        priority: task.priority,
        status: task.status,
        patientId: task.patientId || '',
        assignedTo: task.assignedTo || '',
        dueDate: task.dueDate || '',
      });
    } else {
      setForm({
        title: '',
        description: '',
        category: '',
        priority: 'normal',
        status: 'todo',
        patientId: '',
        assignedTo: '',
        dueDate: '',
      });
    }
  }, [task, isOpen]);

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      alert('Please enter a task title');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(form);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title={task ? 'Edit Task' : 'New Task'} onClose={onClose} size="lg">
      <div className="modal-form">
        {/* Title */}
        <div className="form-field">
          <label>
            Task Title <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Enter task title..."
            autoFocus
          />
        </div>

        {/* Description */}
        <div className="form-field">
          <label>Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Add details about the task..."
            rows={3}
          />
        </div>

        {/* Patient Selection */}
        <div className="form-field">
          <label>Related Patient</label>
          <select
            value={form.patientId}
            onChange={(e) => setForm((prev) => ({ ...prev, patientId: e.target.value }))}
          >
            <option value="">No patient (general task)</option>
            {patients
              .sort((a, b) => {
                const nameA = `${a.lastName}, ${a.firstName}`.toLowerCase();
                const nameB = `${b.lastName}, ${b.firstName}`.toLowerCase();
                return nameA.localeCompare(nameB);
              })
              .map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.lastName}, {patient.firstName}
                  {patient.dob && ` (DOB: ${new Date(patient.dob).toLocaleDateString()})`}
                </option>
              ))}
          </select>
        </div>

        {/* Category */}
        <div className="form-field">
          <label>Category</label>
          <select
            value={form.category}
            onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as TaskCategory | '' }))}
          >
            <option value="">No category</option>
            {TASK_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Priority and Status Row */}
        <div className="form-row">
          <div className="form-field">
            <label>Priority</label>
            <select
              value={form.priority}
              onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as TaskPriority }))}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="form-field">
            <label>Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as TaskStatus }))}
            >
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Assigned To and Due Date Row */}
        <div className="form-row">
          <div className="form-field">
            <label>Assign To</label>
            <select
              value={form.assignedTo}
              onChange={(e) => setForm((prev) => ({ ...prev, assignedTo: e.target.value }))}
            >
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Due Date</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
            />
          </div>
        </div>

        {/* Help Text */}
        <div
          style={{
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '6px',
            padding: '0.75rem',
            fontSize: '0.875rem',
            color: '#0369a1',
          }}
        >
          <strong>Tip:</strong> Use categories to organize tasks and set priorities for better workflow management.
        </div>
      </div>

      {/* Footer */}
      <div className="modal-footer">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Saving...' : task ? 'Update Task' : 'Create Task'}
        </button>
      </div>
    </Modal>
  );
}
