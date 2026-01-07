import { type ReactNode } from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  children?: ReactNode;
}

export function EmptyState({ icon = '', title, description, action, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {action && (
        <button onClick={action.onClick} className="empty-state-action">
          {action.label}
        </button>
      )}
      {children}
    </div>
  );
}

// Preset empty states for common scenarios
export function NoPatients({ onAddPatient }: { onAddPatient: () => void }) {
  return (
    <EmptyState
      icon=""
      title="No patients yet"
      description="Get started by adding your first patient to the system."
      action={{ label: '+ Add Patient', onClick: onAddPatient }}
    />
  );
}

export function NoAppointments({ onAddAppointment }: { onAddAppointment?: () => void }) {
  return (
    <EmptyState
      icon=""
      title="No appointments scheduled"
      description="There are no appointments for this day. Schedule a new appointment to get started."
      action={onAddAppointment ? { label: '+ Schedule Appointment', onClick: onAddAppointment } : undefined}
    />
  );
}

export function NoMessages() {
  return (
    <EmptyState
      icon=""
      title="No messages"
      description="Your inbox is empty. New messages will appear here."
    />
  );
}

export function NoDocuments({ onUpload }: { onUpload?: () => void }) {
  return (
    <EmptyState
      icon=""
      title="No documents"
      description="Upload documents to keep patient records organized."
      action={onUpload ? { label: '+ Upload Document', onClick: onUpload } : undefined}
    />
  );
}

export function NoPhotos({ onUpload }: { onUpload?: () => void }) {
  return (
    <EmptyState
      icon=""
      title="No photos"
      description="Clinical photos will be displayed here."
      action={onUpload ? { label: '+ Upload Photo', onClick: onUpload } : undefined}
    />
  );
}

export function NoTasks({ onAddTask }: { onAddTask?: () => void }) {
  return (
    <EmptyState
      icon=""
      title="No tasks"
      description="All caught up! Create a new task to stay organized."
      action={onAddTask ? { label: '+ New Task', onClick: onAddTask } : undefined}
    />
  );
}

export function NoResults({ query }: { query?: string }) {
  return (
    <EmptyState
      icon=""
      title="No results found"
      description={query ? `No results found for "${query}". Try adjusting your search.` : 'Try adjusting your search criteria.'}
    />
  );
}

export function NoData() {
  return (
    <EmptyState
      icon=""
      title="No data available"
      description="Data will appear here once it's available."
    />
  );
}
