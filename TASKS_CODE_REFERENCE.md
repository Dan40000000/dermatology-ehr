# Tasks Tab - Key Code Reference

## Component Structure

### TasksTab Component Location
`/frontend/src/components/patient/TasksTab.tsx`

### Key Sections

#### 1. Component Props
```typescript
interface TasksTabProps {
  patientId: string;
}
```

#### 2. State Management
```typescript
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
```

#### 3. Data Loading
```typescript
const loadData = async () => {
  if (!session) return;
  
  try {
    setLoading(true);
    const [tasksRes, providersRes] = await Promise.all([
      fetchTasks(session.tenantId, session.accessToken, { sortBy, sortOrder }),
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
```

#### 4. Priority Color Function
```typescript
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
```

#### 5. Due Date Formatting
```typescript
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
```

#### 6. Filter Logic
```typescript
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
```

## PatientDetailPage Integration

### Location
`/frontend/src/pages/PatientDetailPage.tsx`

### Key Changes

#### 1. Import Additions
```typescript
import { TasksTab } from '../components/patient';
import {
  // ... existing imports
  fetchTasks,
  // ...
} from '../api';
import type { /* ... existing types */, Task } from '../types';
```

#### 2. TabId Type Update
```typescript
type TabId = 'overview' | 'demographics' | 'insurance' | 'medical-history' | 
  'encounters' | 'appointments' | 'documents' | 'photos' | 'timeline' | 
  'rx-history' | 'tasks';
```

#### 3. State Addition
```typescript
const [tasks, setTasks] = useState<Task[]>([]);
```

#### 4. Data Loading
```typescript
const [patientRes, encountersRes, appointmentsRes, documentsRes, 
       photosRes, prescriptionsRes, tasksRes] = await Promise.all([
  fetchPatient(session.tenantId, session.accessToken, patientId),
  fetchEncounters(session.tenantId, session.accessToken),
  fetchAppointments(session.tenantId, session.accessToken, patientId),
  fetchDocuments(session.tenantId, session.accessToken),
  fetchPhotos(session.tenantId, session.accessToken),
  fetchPrescriptionsEnhanced(session.tenantId, session.accessToken, { patientId }),
  fetchTasks(session.tenantId, session.accessToken),
]);

// ... later in the code
setTasks((tasksRes.tasks || []).filter((t: Task) => t.patientId === patientId));
```

#### 5. Tabs Array
```typescript
const tabs: { id: TabId; label: string; icon: string; count?: number }[] = [
  // ... existing tabs
  { id: 'tasks', label: 'Tasks', icon: '✓', count: tasks.filter(t => t.status !== 'completed').length },
  // ... remaining tabs
];
```

#### 6. Tab Rendering
```typescript
{activeTab === 'tasks' && patientId && (
  <TasksTab patientId={patientId} />
)}
```

## Task Modal Component

### Modal Props
```typescript
interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  task: Task | null;
  providers: Provider[];
  onSave: () => void;
}
```

### Form State
```typescript
const [formData, setFormData] = useState<CreateTaskData>({
  patientId,
  title: '',
  description: '',
  priority: 'normal',
  status: 'todo',
  dueDate: '',
  assignedTo: '',
});
```

### Submit Handler
```typescript
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
```

## Backend API Reference

### Endpoints Used

1. **GET /api/tasks**
   - Query params: status, priority, sortBy, sortOrder
   - Returns: `{ tasks: Task[] }`

2. **POST /api/tasks**
   - Body: CreateTaskData
   - Returns: `{ id: string }`

3. **PUT /api/tasks/:id**
   - Body: Partial<CreateTaskData>
   - Returns: `{ success: boolean }`

4. **PUT /api/tasks/:id/status**
   - Body: `{ status: TaskStatus }`
   - Returns: `{ success: boolean }`

5. **DELETE /api/tasks/:id**
   - Returns: `{ success: boolean }`

6. **GET /api/providers**
   - Returns: `{ providers: Provider[] }`

## Styling Examples

### Priority Badge
```typescript
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
```

### Status Badge
```typescript
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
```

### Filter Section
```typescript
<div style={{
  display: 'flex',
  gap: '1rem',
  marginBottom: '1rem',
  padding: '1rem',
  background: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '8px'
}}>
  {/* Filter dropdowns */}
</div>
```

## Component Export

### `/frontend/src/components/patient/index.ts`
```typescript
export { TasksTab } from './TasksTab';
```

This allows clean imports:
```typescript
import { TasksTab } from '../components/patient';
```
