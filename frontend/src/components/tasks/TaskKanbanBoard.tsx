import { useState } from 'react';
import type { Task, TaskStatus } from '../../types';

interface TaskKanbanBoardProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
}

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'todo', label: 'To Do', color: '#94a3b8' },
  { status: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { status: 'completed', label: 'Completed', color: '#10b981' },
];

export function TaskKanbanBoard({ tasks, onTaskClick, onStatusChange }: TaskKanbanBoardProps) {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

  const getTasksByStatus = (status: TaskStatus) => {
    return tasks.filter((t) => t.status === status);
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

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

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, newStatus: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (draggedTask && draggedTask.status !== newStatus) {
      onStatusChange(draggedTask.id, newStatus);
    }
    setDraggedTask(null);
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1rem',
        padding: '1rem',
        height: 'calc(100vh - 300px)',
        overflow: 'hidden',
      }}
    >
      {COLUMNS.map((column) => {
        const columnTasks = getTasksByStatus(column.status);
        const isDragOver = dragOverColumn === column.status;

        return (
          <div
            key={column.status}
            onDragOver={(e) => handleDragOver(e, column.status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column.status)}
            style={{
              background: isDragOver ? '#f0f9ff' : '#ffffff',
              border: isDragOver ? `2px dashed ${column.color}` : '1px solid #e5e7eb',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              transition: 'all 0.2s',
            }}
          >
            {/* Column Header */}
            <div
              style={{
                background: column.color,
                color: '#ffffff',
                padding: '0.75rem 1rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>{column.label}</span>
              <span
                style={{
                  background: 'rgba(255, 255, 255, 0.3)',
                  padding: '0.125rem 0.5rem',
                  borderRadius: '12px',
                  fontSize: '0.875rem',
                }}
              >
                {columnTasks.length}
              </span>
            </div>

            {/* Column Content */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {columnTasks.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '2rem 1rem',
                    color: '#9ca3af',
                    fontSize: '0.875rem',
                  }}
                >
                  No tasks
                </div>
              ) : (
                columnTasks.map((task) => {
                  const overdue = task.status !== 'completed' && isOverdue(task.dueDate);
                  const isDragging = draggedTask?.id === task.id;

                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task)}
                      onDragEnd={handleDragEnd}
                      onClick={() => onTaskClick(task)}
                      style={{
                        background: isDragging ? '#f3f4f6' : '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderLeft: `4px solid ${getPriorityColor(task.priority)}`,
                        borderRadius: '6px',
                        padding: '0.75rem',
                        cursor: 'pointer',
                        opacity: isDragging ? 0.5 : 1,
                        transition: 'all 0.2s',
                        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                      }}
                      onMouseEnter={(e) => {
                        if (!isDragging) {
                          e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
                      }}
                    >
                      {/* Task Title */}
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          color: '#1f2937',
                          marginBottom: '0.5rem',
                          lineHeight: '1.4',
                        }}
                      >
                        {task.title}
                      </div>

                      {/* Task Details */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        {/* Patient */}
                        {task.patientFirstName && task.patientLastName && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: '#6b7280',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <span></span>
                            <span>
                              {task.patientLastName}, {task.patientFirstName}
                            </span>
                          </div>
                        )}

                        {/* Category */}
                        {task.category && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: '#6b7280',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <span
                              style={{
                                background: '#e0f2fe',
                                color: '#0369a1',
                                padding: '0.125rem 0.375rem',
                                borderRadius: '4px',
                              }}
                            >
                              {task.category.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                            </span>
                          </div>
                        )}

                        {/* Due Date */}
                        {task.dueDate && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: overdue ? '#dc2626' : '#6b7280',
                              fontWeight: overdue ? 600 : 400,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <span></span>
                            <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                            {overdue && (
                              <span
                                style={{
                                  background: '#dc2626',
                                  color: '#ffffff',
                                  padding: '0.125rem 0.25rem',
                                  borderRadius: '3px',
                                  fontSize: '0.625rem',
                                  fontWeight: 700,
                                }}
                              >
                                OVERDUE
                              </span>
                            )}
                          </div>
                        )}

                        {/* Assigned To */}
                        {task.assignedToName && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: '#6b7280',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <span></span>
                            <span>{task.assignedToName}</span>
                          </div>
                        )}
                      </div>

                      {/* Priority Indicator */}
                      <div
                        style={{
                          marginTop: '0.5rem',
                          paddingTop: '0.5rem',
                          borderTop: '1px solid #f3f4f6',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        <div
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: getPriorityColor(task.priority),
                          }}
                        />
                        <span
                          style={{
                            fontSize: '0.625rem',
                            color: '#9ca3af',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                            letterSpacing: '0.5px',
                          }}
                        >
                          {task.priority} priority
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
