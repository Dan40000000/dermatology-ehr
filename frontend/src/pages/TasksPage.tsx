import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton, ExportButtons } from '../components/ui';
import type { ExportColumn } from '../utils/export';
import { formatDate as formatExportDate } from '../utils/export';
import {
  fetchTasks,
  fetchPatients,
  fetchProviders,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  fetchTaskComments,
  addTaskComment,
} from '../api';
import { TaskKanbanBoard } from '../components/tasks/TaskKanbanBoard';
import { TaskDetailModal } from '../components/tasks/TaskDetailModal';
import { TaskFormModal, type TaskFormData } from '../components/tasks/TaskFormModal';
import type { Task, Patient, Provider, TaskComment, TaskStatus, TaskCategory, TaskPriority } from '../types';

type ViewMode = 'kanban' | 'list';

export function TasksPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  // Modals
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [showEditTaskModal, setShowEditTaskModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    category: '',
    priority: '',
    assignedTo: '',
  });

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const [tasksRes, patientsRes, providersRes] = await Promise.all([
        fetchTasks(session.tenantId, session.accessToken, {
          ...filters,
          sortBy: 'dueDate',
          sortOrder: 'asc',
        }),
        fetchPatients(session.tenantId, session.accessToken),
        fetchProviders(session.tenantId, session.accessToken),
      ]);

      setTasks(tasksRes.tasks || []);
      setPatients(patientsRes.patients || []);
      setProviders(providersRes.providers || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [session, filters, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          setShowNewTaskModal(true);
        }
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          document.getElementById('task-search')?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCreateTask = async (data: TaskFormData) => {
    if (!session) return;

    try {
      await createTask(session.tenantId, session.accessToken, {
        title: data.title,
        description: data.description || undefined,
        category: data.category || undefined,
        priority: data.priority,
        status: data.status,
        patientId: data.patientId || undefined,
        assignedTo: data.assignedTo || undefined,
        dueDate: data.dueDate || undefined,
      });

      showSuccess('Task created successfully');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to create task');
      throw err;
    }
  };

  const handleUpdateTask = async (taskId: string, updates: Partial<Task>) => {
    if (!session) return;

    try {
      await updateTask(session.tenantId, session.accessToken, taskId, updates);
      showSuccess('Task updated successfully');
      loadData();

      // Refresh comments if detail modal is open
      if (showDetailModal && selectedTask) {
        await loadTaskComments(taskId);
      }
    } catch (err: any) {
      showError(err.message || 'Failed to update task');
      throw err;
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    if (!session) return;

    try {
      await updateTaskStatus(session.tenantId, session.accessToken, taskId, newStatus);
      showSuccess(`Task moved to ${newStatus.replace('_', ' ')}`);
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to update task status');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!session) return;

    try {
      await deleteTask(session.tenantId, session.accessToken, taskId);
      showSuccess('Task deleted successfully');
      loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to delete task');
      throw err;
    }
  };

  const loadTaskComments = async (taskId: string) => {
    if (!session) return;

    setLoadingComments(true);
    try {
      const res = await fetchTaskComments(session.tenantId, session.accessToken, taskId);
      setTaskComments(res.comments || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load comments');
    } finally {
      setLoadingComments(false);
    }
  };

  const handleAddComment = async (taskId: string, comment: string) => {
    if (!session) return;

    try {
      await addTaskComment(session.tenantId, session.accessToken, taskId, comment);
      showSuccess('Comment added');
      await loadTaskComments(taskId);
    } catch (err: any) {
      showError(err.message || 'Failed to add comment');
      throw err;
    }
  };

  const handleTaskClick = async (task: Task) => {
    setSelectedTask(task);
    setShowDetailModal(true);
    await loadTaskComments(task.id);
  };

  const handleEditClick = (task: Task) => {
    setSelectedTask(task);
    setShowEditTaskModal(true);
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    if (!task) return false;
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const title = (task.title || '').toLowerCase();
      const patientName =
        task.patientFirstName && task.patientLastName
          ? `${task.patientLastName}, ${task.patientFirstName}`.toLowerCase()
          : '';
      if (!title.includes(searchLower) && !patientName.includes(searchLower)) {
        return false;
      }
    }
    return true;
  });

  // Stats
  const todoCount = tasks.filter((t) => t && t.status === 'todo').length;
  const inProgressCount = tasks.filter((t) => t && t.status === 'in_progress').length;
  const completedCount = tasks.filter((t) => t && t.status === 'completed').length;
  const overdueCount = tasks.filter((t) => t && t.status !== 'completed' && isOverdue(t.dueDate)).length;
  const myTasksCount = tasks.filter((t) => t && t.assignedTo === session?.user?.id).length;

  const users = providers.map((p) => ({ id: p.id, fullName: p.fullName }));

  return (
    <div className="tasks-page" style={{
      background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 50%, #a7f3d0 100%)',
      minHeight: '100vh',
      padding: '1.5rem'
    }}>
      {/* Action Bar */}
      <div className="ema-action-bar" style={{
        background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
        padding: '1rem 1.5rem',
        borderRadius: '12px',
        marginBottom: '1.5rem',
        boxShadow: '0 10px 25px rgba(16, 185, 129, 0.3)',
        display: 'flex',
        gap: '0.75rem',
        flexWrap: 'wrap'
      }}>
        <button type="button" className="ema-action-btn" onClick={() => setShowNewTaskModal(true)} style={{
          background: 'rgba(255,255,255,0.95)',
          border: '2px solid rgba(255,255,255,0.4)',
          padding: '0.75rem 1.25rem',
          borderRadius: '8px',
          fontWeight: 600,
          color: '#059669',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }} onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        }} onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        }}>
          <span className="icon" style={{ fontSize: '1.2rem' }}>✚</span>
          New Task <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>(N)</span>
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="ema-action-btn"
            style={{
              background: viewMode === 'kanban' ? '#0f766e' : undefined,
              color: viewMode === 'kanban' ? '#ffffff' : undefined,
            }}
            onClick={() => setViewMode('kanban')}
          >
            <span className="icon"></span>
            Kanban
          </button>
          <button
            type="button"
            className="ema-action-btn"
            style={{
              background: viewMode === 'list' ? '#0f766e' : undefined,
              color: viewMode === 'list' ? '#ffffff' : undefined,
            }}
            onClick={() => setViewMode('list')}
          >
            <span className="icon"></span>
            List
          </button>
          <button type="button" className="ema-action-btn" onClick={loadData}>
            <span className="icon"></span>
            Refresh
          </button>
          <ExportButtons
            data={filteredTasks}
            filename="Tasks"
            columns={[
              { key: 'title', label: 'Title' },
              { key: 'category', label: 'Category' },
              { key: 'priority', label: 'Priority' },
              { key: 'status', label: 'Status' },
              { key: 'assignedToName', label: 'Assigned To' },
              { key: 'patientFirstName', label: 'Patient First Name' },
              { key: 'patientLastName', label: 'Patient Last Name' },
              { key: 'dueDate', label: 'Due Date', format: (date) => formatExportDate(date, 'short') },
              { key: 'description', label: 'Description' },
              { key: 'createdAt', label: 'Created', format: (date) => formatExportDate(date, 'datetime') },
            ] as ExportColumn[]}
            variant="dropdown"
            pdfOptions={{ title: 'Task List', orientation: 'landscape' }}
          />
        </div>
      </div>

      {/* Section Header */}
      <div className="ema-section-header" style={{
        background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
        color: '#ffffff',
        padding: '1rem 1.5rem',
        borderRadius: '10px',
        marginBottom: '1.5rem',
        fontSize: '1.25rem',
        fontWeight: 700,
        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem'
      }}>
        <span style={{ fontSize: '1.5rem' }}>✓</span>
        Task Management
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div
          className="stat-card-teal"
          style={{
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
            padding: '1.25rem',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
            border: '2px solid rgba(255,255,255,0.4)',
            transition: 'all 0.3s ease'
          }}
          onClick={() => setFilters((prev) => ({ ...prev, status: '' }))}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(16, 185, 129, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.25)';
          }}
        >
          <div className="stat-number" style={{ color: '#ffffff', fontSize: '2rem', fontWeight: 700, textShadow: '1px 1px 2px rgba(0,0,0,0.2)' }}>{tasks.length}</div>
          <div className="stat-label" style={{ color: '#ffffff', fontSize: '0.85rem', fontWeight: 600, marginTop: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Tasks</div>
        </div>
        <div
          className="stat-card-teal"
          style={{
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #6ee7b7 0%, #34d399 100%)',
            padding: '1.25rem',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
            border: '2px solid rgba(255,255,255,0.4)',
            transition: 'all 0.3s ease'
          }}
          onClick={() => setFilters((prev) => ({ ...prev, status: 'todo' }))}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(16, 185, 129, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.25)';
          }}
        >
          <div className="stat-number" style={{ color: '#ffffff', fontSize: '2rem', fontWeight: 700, textShadow: '1px 1px 2px rgba(0,0,0,0.2)' }}>{todoCount}</div>
          <div className="stat-label" style={{ color: '#ffffff', fontSize: '0.85rem', fontWeight: 600, marginTop: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>To Do</div>
        </div>
        <div
          className="stat-card-teal"
          style={{
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
            padding: '1.25rem',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
            border: '2px solid rgba(255,255,255,0.4)',
            transition: 'all 0.3s ease'
          }}
          onClick={() => setFilters((prev) => ({ ...prev, status: 'in_progress' }))}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(16, 185, 129, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.25)';
          }}
        >
          <div className="stat-number" style={{ color: '#ffffff', fontSize: '2rem', fontWeight: 700, textShadow: '1px 1px 2px rgba(0,0,0,0.2)' }}>{inProgressCount}</div>
          <div className="stat-label" style={{ color: '#ffffff', fontSize: '0.85rem', fontWeight: 600, marginTop: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>In Progress</div>
        </div>
        <div
          className="stat-card-teal"
          style={{
            cursor: 'pointer',
            background: overdueCount > 0 ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)' : 'linear-gradient(135deg, #6ee7b7 0%, #34d399 100%)',
            padding: '1.25rem',
            borderRadius: '12px',
            boxShadow: overdueCount > 0 ? '0 4px 12px rgba(220, 38, 38, 0.25)' : '0 4px 12px rgba(16, 185, 129, 0.25)',
            border: '2px solid rgba(255,255,255,0.4)',
            transition: 'all 0.3s ease'
          }}
          onClick={() => setFilters((prev) => ({ ...prev, assignedTo: 'overdue' }))}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = overdueCount > 0 ? '0 8px 20px rgba(220, 38, 38, 0.4)' : '0 8px 20px rgba(16, 185, 129, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = overdueCount > 0 ? '0 4px 12px rgba(220, 38, 38, 0.25)' : '0 4px 12px rgba(16, 185, 129, 0.25)';
          }}
        >
          <div className="stat-number" style={{ color: '#ffffff', fontSize: '2rem', fontWeight: 700, textShadow: '1px 1px 2px rgba(0,0,0,0.2)' }}>{overdueCount}</div>
          <div className="stat-label" style={{ color: '#ffffff', fontSize: '0.85rem', fontWeight: 600, marginTop: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Overdue</div>
        </div>
        <div
          className="stat-card-teal"
          style={{
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
            padding: '1.25rem',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
            border: '2px solid rgba(255,255,255,0.4)',
            transition: 'all 0.3s ease'
          }}
          onClick={() => setFilters((prev) => ({ ...prev, assignedTo: 'me' }))}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(16, 185, 129, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.25)';
          }}
        >
          <div className="stat-number" style={{ color: '#ffffff', fontSize: '2rem', fontWeight: 700, textShadow: '1px 1px 2px rgba(0,0,0,0.2)' }}>{myTasksCount}</div>
          <div className="stat-label" style={{ color: '#ffffff', fontSize: '0.85rem', fontWeight: 600, marginTop: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>My Tasks</div>
        </div>
      </div>

      {/* Filter Panel */}
      <div className="ema-filter-panel">
        <div className="ema-filter-row">
          <div className="ema-filter-group">
            <label className="ema-filter-label">
              Search <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>(Press /)</span>
            </label>
            <input
              id="task-search"
              type="text"
              className="ema-filter-input"
              placeholder="Search tasks or patients..."
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            />
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Category</label>
            <select
              className="ema-filter-select"
              value={filters.category}
              onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
            >
              <option value="">All Categories</option>
              <option value="patient-followup">Patient Follow-up</option>
              <option value="prior-auth">Prior Authorization</option>
              <option value="lab-path-followup">Lab/Path Follow-up</option>
              <option value="prescription-refill">Prescription Refill</option>
              <option value="insurance-verification">Insurance Verification</option>
              <option value="general">General</option>
            </select>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Priority</label>
            <select
              className="ema-filter-select"
              value={filters.priority}
              onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value }))}
            >
              <option value="">All Priorities</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="ema-filter-group">
            <label className="ema-filter-label">Assigned To</label>
            <select
              className="ema-filter-select"
              value={filters.assignedTo}
              onChange={(e) => setFilters((prev) => ({ ...prev, assignedTo: e.target.value }))}
            >
              <option value="">All Users</option>
              <option value="me">My Tasks</option>
              <option value="unassigned">Unassigned</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </div>

          {(filters.search || filters.category || filters.priority || filters.assignedTo) && (
            <button
              type="button"
              onClick={() => setFilters({ search: '', status: '', category: '', priority: '', assignedTo: '' })}
              style={{
                padding: '0.5rem 1rem',
                background: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                marginTop: '1.5rem',
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: '1rem' }}>
          <Skeleton variant="card" height={400} />
        </div>
      ) : filteredTasks.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem',
            background: '#ffffff',
            margin: '1rem',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>No Tasks Found</h3>
          <p style={{ color: '#6b7280', margin: '0 0 1rem' }}>
            {filters.search || filters.category || filters.priority || filters.assignedTo
              ? 'No tasks match your filter criteria'
              : 'Get started by creating your first task'}
          </p>
          <button type="button" className="btn-primary" onClick={() => setShowNewTaskModal(true)}>
            Create First Task
          </button>
        </div>
      ) : viewMode === 'kanban' ? (
        <TaskKanbanBoard tasks={filteredTasks} onTaskClick={handleTaskClick} onStatusChange={handleStatusChange} />
      ) : (
        <table className="ema-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Task</th>
              <th>Patient</th>
              <th>Category</th>
              <th>Due Date</th>
              <th>Priority</th>
              <th>Assigned To</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map((task) => {
              const overdue = task.status !== 'completed' && isOverdue(task.dueDate);
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
                <tr
                  key={task.id}
                  style={{
                    background: overdue ? '#fef2f2' : task.status === 'completed' ? '#f0fdf4' : undefined,
                    cursor: 'pointer',
                  }}
                  onClick={() => handleTaskClick(task)}
                >
                  <td>
                    <span
                      style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
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
                  </td>
                  <td>
                    <div style={{ fontWeight: 500, color: '#1f2937' }}>{task.title}</div>
                    {task.description && (
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                        {task.description.length > 50 ? task.description.slice(0, 50) + '...' : task.description}
                      </div>
                    )}
                  </td>
                  <td>
                    {task.patientFirstName && task.patientLastName ? (
                      <span style={{ color: '#0369a1', fontWeight: 500 }}>
                        {task.patientLastName}, {task.patientFirstName}
                      </span>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>—</span>
                    )}
                  </td>
                  <td>
                    {task.category ? (
                      <span
                        style={{
                          background: '#e0f2fe',
                          color: '#0369a1',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                        }}
                      >
                        {task.category.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                      </span>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>—</span>
                    )}
                  </td>
                  <td>
                    {task.dueDate ? (
                      <div>
                        <span style={{ color: overdue ? '#dc2626' : '#374151', fontWeight: overdue ? 600 : 400 }}>
                          {new Date(task.dueDate).toLocaleDateString()}
                        </span>
                        {overdue && (
                          <div
                            style={{
                              marginTop: '0.25rem',
                              background: '#dc2626',
                              color: '#ffffff',
                              padding: '0.125rem 0.375rem',
                              borderRadius: '4px',
                              fontSize: '0.625rem',
                              display: 'inline-block',
                            }}
                          >
                            OVERDUE
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>No due date</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: getPriorityColor(task.priority),
                        }}
                      />
                      <span style={{ textTransform: 'capitalize' }}>{task.priority}</span>
                    </div>
                  </td>
                  <td>{task.assignedToName || <span style={{ color: '#9ca3af' }}>Unassigned</span>}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditClick(task);
                        }}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: '#f3f4f6',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                        }}
                        title="Edit"
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* New Task Modal */}
      <TaskFormModal
        isOpen={showNewTaskModal}
        onClose={() => setShowNewTaskModal(false)}
        onSubmit={handleCreateTask}
        patients={patients}
        users={users}
      />

      {/* Edit Task Modal */}
      {selectedTask && (
        <TaskFormModal
          isOpen={showEditTaskModal}
          onClose={() => {
            setShowEditTaskModal(false);
            setSelectedTask(null);
          }}
          onSubmit={(data) => handleUpdateTask(selectedTask.id, {
            title: data.title,
            description: data.description || undefined,
            category: data.category || undefined,
            priority: data.priority,
            status: data.status,
            dueDate: data.dueDate || undefined,
            assignedTo: data.assignedTo || undefined,
          })}
          task={selectedTask}
          patients={patients}
          users={users}
        />
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedTask(null);
            setTaskComments([]);
          }}
          task={selectedTask}
          comments={taskComments}
          users={users}
          onUpdate={handleUpdateTask}
          onAddComment={handleAddComment}
          onDelete={handleDeleteTask}
        />
      )}
    </div>
  );
}
