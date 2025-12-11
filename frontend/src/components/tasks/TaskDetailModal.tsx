import { useState, useEffect } from 'react';
import { Modal } from '../ui';
import type { Task, TaskComment, TaskStatus, TaskPriority } from '../../types';

interface TaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
  comments: TaskComment[];
  users: Array<{ id: string; fullName: string }>;
  onUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onAddComment: (taskId: string, comment: string) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
}

export function TaskDetailModal({
  isOpen,
  onClose,
  task,
  comments,
  users,
  onUpdate,
  onAddComment,
  onDelete,
}: TaskDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editForm, setEditForm] = useState({
    status: task.status,
    priority: task.priority,
    assignedTo: task.assignedTo || '',
    dueDate: task.dueDate || '',
  });

  useEffect(() => {
    setEditForm({
      status: task.status,
      priority: task.priority,
      assignedTo: task.assignedTo || '',
      dueDate: task.dueDate || '',
    });
  }, [task]);

  const handleStatusChange = async (newStatus: TaskStatus) => {
    await onUpdate(task.id, { status: newStatus });
    setEditForm((prev) => ({ ...prev, status: newStatus }));
  };

  const handleSaveChanges = async () => {
    setSubmitting(true);
    try {
      await onUpdate(task.id, {
        status: editForm.status,
        priority: editForm.priority,
        assignedTo: editForm.assignedTo || undefined,
        dueDate: editForm.dueDate || undefined,
      });
      setIsEditing(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      await onAddComment(task.id, newComment);
      setNewComment('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    setSubmitting(true);
    try {
      await onDelete(task.id);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'completed';

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return '#dc2626';
      case 'normal':
        return '#f59e0b';
      case 'low':
        return '#10b981';
      default:
        return '#6b7280';
    }
  };

  return (
    <Modal isOpen={isOpen} title="Task Details" onClose={onClose} size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Header Section */}
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1f2937', marginBottom: '0.5rem' }}>
            {task.title}
          </h2>
          {task.description && (
            <p style={{ color: '#6b7280', lineHeight: '1.6' }}>{task.description}</p>
          )}
        </div>

        {/* Status Badges */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: '12px',
              fontSize: '0.875rem',
              fontWeight: 600,
              background:
                task.status === 'completed'
                  ? '#d1fae5'
                  : task.status === 'in_progress'
                  ? '#dbeafe'
                  : '#f3f4f6',
              color:
                task.status === 'completed'
                  ? '#065f46'
                  : task.status === 'in_progress'
                  ? '#1e40af'
                  : '#374151',
            }}
          >
            {task.status.replace('_', ' ').toUpperCase()}
          </span>
          <span
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: '12px',
              fontSize: '0.875rem',
              fontWeight: 600,
              background: getPriorityColor(task.priority) + '20',
              color: getPriorityColor(task.priority),
            }}
          >
            {task.priority.toUpperCase()} PRIORITY
          </span>
          {isOverdue && (
            <span
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '12px',
                fontSize: '0.875rem',
                fontWeight: 600,
                background: '#fee2e2',
                color: '#dc2626',
              }}
            >
              OVERDUE
            </span>
          )}
        </div>

        {/* Details Grid */}
        {!isEditing ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', marginBottom: '0.25rem' }}>
                PATIENT
              </div>
              <div style={{ color: '#1f2937' }}>
                {task.patientFirstName && task.patientLastName
                  ? `${task.patientLastName}, ${task.patientFirstName}`
                  : 'Not linked'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', marginBottom: '0.25rem' }}>
                ASSIGNED TO
              </div>
              <div style={{ color: '#1f2937' }}>{task.assignedToName || 'Unassigned'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', marginBottom: '0.25rem' }}>
                DUE DATE
              </div>
              <div style={{ color: isOverdue ? '#dc2626' : '#1f2937', fontWeight: isOverdue ? 600 : 400 }}>
                {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', marginBottom: '0.25rem' }}>
                CATEGORY
              </div>
              <div style={{ color: '#1f2937' }}>
                {task.category?.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) || 'None'}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Status
              </label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value as TaskStatus }))}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                }}
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Priority
              </label>
              <select
                value={editForm.priority}
                onChange={(e) => setEditForm((prev) => ({ ...prev, priority: e.target.value as TaskPriority }))}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                }}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Assigned To
              </label>
              <select
                value={editForm.assignedTo}
                onChange={(e) => setEditForm((prev) => ({ ...prev, assignedTo: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                }}
              >
                <option value="">Unassigned</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Due Date
              </label>
              <input
                type="date"
                value={editForm.dueDate}
                onChange={(e) => setEditForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                }}
              />
            </div>
          </div>
        )}

        {/* Quick Actions */}
        {!isEditing && task.status !== 'completed' && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {task.status === 'todo' && (
              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                onClick={() => handleStatusChange('in_progress')}
              >
                Start Task
              </button>
            )}
            {task.status === 'in_progress' && (
              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                onClick={() => handleStatusChange('completed')}
              >
                Mark Complete
              </button>
            )}
          </div>
        )}

        {/* Comments Section */}
        <div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Comments</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {comments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                No comments yet. Be the first to add one!
              </div>
            ) : (
              comments.map((comment) => (
                <div
                  key={comment.id}
                  style={{
                    background: '#f9fafb',
                    padding: '1rem',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 600, color: '#1f2937' }}>{comment.userName}</span>
                    <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                      {new Date(comment.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ color: '#4b5563', lineHeight: '1.6' }}>{comment.comment}</div>
                </div>
              ))
            )}
          </div>

          {/* Add Comment */}
          <div style={{ marginTop: '1rem' }}>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              rows={3}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                resize: 'vertical',
              }}
            />
            <button
              type="button"
              className="btn-primary"
              onClick={handleAddComment}
              disabled={submitting || !newComment.trim()}
              style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}
            >
              {submitting ? 'Adding...' : 'Add Comment'}
            </button>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="modal-footer" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <div>
            <button
              type="button"
              style={{
                padding: '0.5rem 1rem',
                background: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
              onClick={handleDelete}
              disabled={submitting}
            >
              Delete Task
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {isEditing ? (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsEditing(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSaveChanges}
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Close
                </button>
                <button type="button" className="btn-primary" onClick={() => setIsEditing(true)}>
                  Edit Task
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
