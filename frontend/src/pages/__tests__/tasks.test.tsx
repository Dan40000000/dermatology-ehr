import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const authMocks = vi.hoisted(() => ({
  session: null as null | { tenantId: string; accessToken: string; user: { id: string } },
}));

const toastMocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  fetchTasks: vi.fn(),
  fetchPatients: vi.fn(),
  fetchProviders: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  deleteTask: vi.fn(),
  fetchTaskComments: vi.fn(),
  addTaskComment: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../../api', () => apiMocks);

vi.mock('../../components/ui', () => ({
  Skeleton: ({ height }: { height?: number }) => <div data-testid="skeleton" data-height={height ?? 0} />,
  ExportButtons: ({ data, filename }: { data?: unknown[]; filename?: string }) => (
    <div data-testid="export-buttons" data-count={data?.length ?? 0} data-filename={filename ?? ''} />
  ),
}));

vi.mock('../../components/tasks/TaskKanbanBoard', () => ({
  TaskKanbanBoard: ({ tasks, onTaskClick, onStatusChange }: any) => (
    <div>
      <div>Kanban Board: {tasks.length} tasks</div>
      <button type="button" onClick={() => tasks[0] && onTaskClick(tasks[0])}>
        Open First Task
      </button>
      <button type="button" onClick={() => tasks[0] && onStatusChange(tasks[0].id, 'in_progress')}>
        Move First Task
      </button>
    </div>
  ),
}));

vi.mock('../../components/tasks/TaskFormModal', () => ({
  TaskFormModal: ({ isOpen, onClose, onSubmit, task }: any) =>
    isOpen ? (
      <div>
        <div>{task ? 'Edit Task Modal' : 'New Task Modal'}</div>
        <button
          type="button"
          onClick={() =>
            onSubmit({
              title: 'New Task',
              description: 'Details',
              category: 'general',
              priority: 'high',
              status: 'todo',
              patientId: 'patient-1',
              assignedTo: 'user-1',
              dueDate: '2025-01-10',
            })
          }
        >
          Submit Task
        </button>
        <button type="button" onClick={onClose}>
          Close Task Modal
        </button>
      </div>
    ) : null,
}));

vi.mock('../../components/tasks/TaskDetailModal', () => ({
  TaskDetailModal: ({ isOpen, task, comments, onUpdate, onAddComment, onDelete, onClose }: any) =>
    isOpen ? (
      <div>
        <div>Task Detail Modal</div>
        <div>Comments: {comments?.length ?? 0}</div>
        <button type="button" onClick={() => onUpdate(task.id, { title: 'Updated' })}>
          Update Task
        </button>
        <button type="button" onClick={() => onAddComment(task.id, 'Note')}>
          Add Comment
        </button>
        <button type="button" onClick={() => onDelete(task.id)}>
          Delete Task
        </button>
        <button type="button" onClick={onClose}>
          Close Detail
        </button>
      </div>
    ) : null,
}));

import { TasksPage } from '../TasksPage';

const buildFixtures = () => ({
  tasks: [
    {
      id: 'task-1',
      title: 'Call patient',
      description: 'Follow up about lab results',
      status: 'todo',
      priority: 'high',
      category: 'patient-followup',
      patientId: 'patient-1',
      patientFirstName: 'Ana',
      patientLastName: 'Derm',
      assignedTo: 'user-1',
      assignedToName: 'Dr Demo',
      dueDate: '2020-01-01',
      createdAt: '2024-01-01',
    },
    {
      id: 'task-2',
      title: 'Review labs',
      description: 'Check pending labs',
      status: 'in_progress',
      priority: 'normal',
      category: 'lab-path-followup',
      assignedTo: 'user-2',
      assignedToName: 'Nurse Joy',
      dueDate: '2030-01-01',
      createdAt: '2024-01-02',
    },
    {
      id: 'task-3',
      title: 'Close chart',
      status: 'completed',
      priority: 'low',
      createdAt: '2024-01-03',
    },
  ],
  patients: [
    { id: 'patient-1', tenantId: 'tenant-1', firstName: 'Ana', lastName: 'Derm', createdAt: '2024-01-01' },
  ],
  providers: [
    { id: 'user-1', tenantId: 'tenant-1', fullName: 'Dr Demo', name: 'Dr Demo', createdAt: '2024-01-01' },
    { id: 'user-2', tenantId: 'tenant-1', fullName: 'Nurse Joy', name: 'Nurse Joy', createdAt: '2024-01-02' },
  ],
});

describe('TasksPage', () => {
  beforeEach(() => {
    authMocks.session = { tenantId: 'tenant-1', accessToken: 'token-1', user: { id: 'user-1' } };
    const fixtures = buildFixtures();
    apiMocks.fetchTasks.mockResolvedValue({ tasks: fixtures.tasks });
    apiMocks.fetchPatients.mockResolvedValue({ patients: fixtures.patients });
    apiMocks.fetchProviders.mockResolvedValue({ providers: fixtures.providers });
    apiMocks.createTask.mockResolvedValue({ ok: true });
    apiMocks.updateTask.mockResolvedValue({ ok: true });
    apiMocks.updateTaskStatus.mockResolvedValue({ ok: true });
    apiMocks.deleteTask.mockResolvedValue({ ok: true });
    apiMocks.fetchTaskComments.mockResolvedValue({ comments: [{ id: 'c1', body: 'Note' }] });
    apiMocks.addTaskComment.mockResolvedValue({ ok: true });
    toastMocks.showSuccess.mockClear();
    toastMocks.showError.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads tasks and supports filters, list view, and modals', async () => {
    render(
      <MemoryRouter>
        <TasksPage />
      </MemoryRouter>
    );

    await screen.findByText('Task Management');

    expect(apiMocks.fetchTasks).toHaveBeenCalledWith(
      'tenant-1',
      'token-1',
      expect.objectContaining({
        search: '',
        status: '',
        category: '',
        priority: '',
        assignedTo: '',
        sortBy: 'dueDate',
        sortOrder: 'asc',
      }),
    );

    expect(screen.getByText('Kanban Board: 3 tasks')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /New Task/ }));
    expect(await screen.findByText('New Task Modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }));
    await waitFor(() => expect(apiMocks.createTask).toHaveBeenCalled());
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Task created successfully');

    fireEvent.click(screen.getByRole('button', { name: 'Move First Task' }));
    await waitFor(() => expect(apiMocks.updateTaskStatus).toHaveBeenCalledWith('tenant-1', 'token-1', 'task-1', 'in_progress'));
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Task moved to in progress');

    fireEvent.click(screen.getByRole('button', { name: 'Open First Task' }));
    await waitFor(() => expect(apiMocks.fetchTaskComments).toHaveBeenCalledWith('tenant-1', 'token-1', 'task-1'));
    expect(screen.getByText('Task Detail Modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
    await waitFor(() => expect(apiMocks.addTaskComment).toHaveBeenCalledWith('tenant-1', 'token-1', 'task-1', 'Note'));
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Comment added');

    fireEvent.click(screen.getByRole('button', { name: 'Update Task' }));
    await waitFor(() => expect(apiMocks.updateTask).toHaveBeenCalledWith('tenant-1', 'token-1', 'task-1', { title: 'Updated' }));
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Task updated successfully');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Task' }));
    await waitFor(() => expect(apiMocks.deleteTask).toHaveBeenCalledWith('tenant-1', 'token-1', 'task-1'));
    expect(toastMocks.showSuccess).toHaveBeenCalledWith('Task deleted successfully');

    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByText('OVERDUE')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText('Search tasks or patients...');
    fireEvent.change(searchInput, { target: { value: 'Ana' } });
    await waitFor(() => {
      expect(screen.getByText('Call patient')).toBeInTheDocument();
      expect(screen.queryByText('Review labs')).not.toBeInTheDocument();
    });

    const clearFiltersButton = screen.getByRole('button', { name: 'Clear Filters' });
    fireEvent.click(clearFiltersButton);
    expect(searchInput).toHaveValue('');

    fireEvent.click(screen.getByText('To Do'));
    await waitFor(() =>
      expect(apiMocks.fetchTasks).toHaveBeenCalledWith('tenant-1', 'token-1', expect.objectContaining({ status: 'todo' })),
    );

    searchInput.blur();
    fireEvent.keyDown(window, { key: '/' });
    await waitFor(() => expect(searchInput).toHaveFocus());
  });
});
