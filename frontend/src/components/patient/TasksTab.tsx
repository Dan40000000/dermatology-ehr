import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Modal } from '../ui';
import {
  fetchTasks,
  fetchProviders,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
} from '../../api';
import type {
  Task,
  Provider,
  CreateTaskData,
  TaskPriority,
  TaskStatus,
} from '../../types';

interface TasksTabProps {
  patientId: string;
}

export function TasksTab({ patientId }: TasksTabProps) {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [sortBy, setSortBy] = useState<'dueDate' | 'priority' | 'createdAt'>('dueDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!session) return;

    try {
      setLoading(true);
      const [tasksRes, providersRes] = await Promise.all([
        fetchTasks(session.tenantId, session.accessToken, {
          sortBy,
          sortOrder,
        }),
        fetchProviders(session.tenantId, session.accessToken),
      ]);

      setTasks((tasksRes.tasks || []).filter((t: Task) => t.patientId === patientId));
      setProviders(providersRes.providers || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = () => {
    setEditingTask(null);
    setShowTaskModal(true);
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setShowTaskModal(true);
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!session) return;
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      await deleteTask(session.tenantId, session.accessToken, taskId);
      showSuccess('Task deleted successfully');
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to delete task');
    }
  };

  const handleToggleComplete = async (task: Task) => {
    if (!session) return;

    const newStatus: TaskStatus = task.status === 'completed' ? 'todo' : 'completed';

    try {
      await updateTaskStatus(session.tenantId, session.accessToken, task.id, newStatus);
      showSuccess(`Task marked as ${newStatus === 'completed' ? 'complete' : 'incomplete'}`);
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to update task status');
    }
  };

  const getPriorityColor = (priority: TaskPriority) => {
    switch (priority) {
      case 'urgent':
        return { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' };
      case 'high':
        return { bg: '#fef3c7', text: '#f59e0b', border: '#fde68a' };
      case 'normal':
        return { bg: '#dbeafe', text: '#0369a1', border: '#bfdbfe' };
      case 'low':
        return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' };
      default:
        return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' };
    }
  };

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'completed':
        return { bg: '#f0fdf4', text: '#10b981', border: '#bbf7d0' };
      case 'in_progress':
        return { bg: '#dbeafe', text: '#0369a1', border: '#bfdbfe' };
      case 'todo':
        return { bg: '#fef3c7', text: '#f59e0b', border: '#fde68a' };
      case 'cancelled':
        return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' };
      default:
        return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' };
    }
  };

  const formatDueDate = (dueDate?: string) => {
    if (!dueDate) return '—';
    const date = new Date(dueDate);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date < today && date.toDateString() !== today.toDateString()) {
      return <span style={{ color: '#dc2626', fontWeight: 600 }}>Overdue: {date.toLocaleDateString()}</span>;
    } else if (date.toDateString() === today.toDateString()) {
      return <span style={{ color: '#f59e0b', fontWeight: 600 }}>Today</span>;
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return <span style={{ color: '#0369a1', fontWeight: 600 }}>Tomorrow</span>;
    }
    return date.toLocaleDateString();
  };

  // Filter and sort tasks
  const filteredTasks = tasks
    .filter((task) => {
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
      return true;
    })
    .sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'dueDate') {
        const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        comparison = aDate - bDate;
      } else if (sortBy === 'priority') {
        const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
        comparison = priorityOrder[a.priority] - priorityOrder[b.priority];
      } else if (sortBy === 'createdAt') {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        Loading tasks...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div className="ema-section-header">Tasks</div>
        <button type="button" className="ema-action-btn" onClick={handleCreateTask}>
          <span className="icon">+</span>
          New Task
        </button>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '1rem',
        padding: '1rem',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '8px'
      }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.25rem', color: '#6b7280' }}>
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}
          >
            <option value="all">All Statuses</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.25rem', color: '#6b7280' }}>
            Priority
          </label>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | 'all')}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.25rem', color: '#6b7280' }}>
            Sort By
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'dueDate' | 'priority' | 'createdAt')}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}
          >
            <option value="dueDate">Due Date</option>
            <option value="priority">Priority</option>
            <option value="createdAt">Created Date</option>
          </select>
        </div>

        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.25rem', color: '#6b7280' }}>
            Order
          </label>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
      </div>

      {/* Tasks Table */}
      {filteredTasks.length === 0 ? (
        <div style={{
          background: '#f9fafb',
          border: '1px dashed #d1d5db',
          borderRadius: '8px',
          padding: '3rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No tasks found</h3>
          <p style={{ color: '#6b7280', margin: '0 0 1rem' }}>
            {tasks.length === 0
              ? 'Create a task to track work for this patient'
              : 'No tasks match the current filters'}
          </p>
          {tasks.length === 0 && (
            <button type="button" className="ema-action-btn" onClick={handleCreateTask}>
              Create Task
            </button>
          )}
        </div>
      ) : (
        <table className="ema-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}></th>
              <th>Title</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Due Date</th>
              <th>Assigned To</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map((task) => {
              const priorityColors = getPriorityColor(task.priority);
              const statusColors = getStatusColor(task.status);

              return (
                <tr key={task.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={task.status === 'completed'}
                      onChange={() => handleToggleComplete(task)}
                      style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                    />
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{task.title}</div>
                    {task.description && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        {task.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      background: priorityColors.bg,
                      color: priorityColors.text,
                      border: `1px solid ${priorityColors.border}`
                    }}>
                      {task.priority}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                      background: statusColors.bg,
                      color: statusColors.text,
                      border: `1px solid ${statusColors.border}`
                    }}>
                      {task.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>{formatDueDate(task.dueDate)}</td>
                  <td>{task.assignedToName || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => handleEditTask(task)}
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
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTask(task.id)}
                        style={{
                          padding: '0.25rem 0.75rem',
                          background: '#dc2626',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Task Modal */}
      {showTaskModal && (
        <TaskModal
          isOpen={showTaskModal}
          onClose={() => {
            setShowTaskModal(false);
            setEditingTask(null);
          }}
          patientId={patientId}
          task={editingTask}
          providers={providers}
          onSave={loadData}
        />
      )}
    </div>
  );
}

// Task Modal Component
interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  task: Task | null;
  providers: Provider[];
  onSave: () => void;
}

function TaskModal({ isOpen, onClose, patientId, task, providers, onSave }: TaskModalProps) {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [formData, setFormData] = useState<CreateTaskData>({
    patientId,
    title: '',
    description: '',
    priority: 'normal',
    status: 'todo',
    dueDate: '',
    assignedTo: '',
  });

  useEffect(() => {
    if (task) {
      setFormData({
        patientId: task.patientId || patientId,
        title: task.title,
        description: task.description || '',
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate || '',
        assignedTo: task.assignedTo || '',
      });
    } else {
      setFormData({
        patientId,
        title: '',
        description: '',
        priority: 'normal',
        status: 'todo',
        dueDate: '',
        assignedTo: '',
      });
    }
  }, [task, patientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    try {
      if (task) {
        await updateTask(session.tenantId, session.accessToken, task.id, formData);
        showSuccess('Task updated successfully');
      } else {
        await createTask(session.tenantId, session.accessToken, formData);
        showSuccess('Task created successfully');
      }
      onSave();
      onClose();
    } catch (err: any) {
      showError(err.message || `Failed to ${task ? 'update' : 'create'} task`);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={task ? 'Edit Task' : 'Create New Task'}
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Title <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as TaskPriority })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as TaskStatus })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Due Date
              </label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Assign To
              </label>
              <select
                value={formData.assignedTo}
                onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
              >
                <option value="">Unassigned</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.fullName || provider.name}
                  </option>
                ))}
              </select>
            </div>
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
              cursor: 'pointer',
              fontSize: '0.875rem'
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
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500
            }}
          >
            {task ? 'Update Task' : 'Create Task'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
