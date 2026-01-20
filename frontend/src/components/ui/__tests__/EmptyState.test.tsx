import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  EmptyState,
  NoPatients,
  NoAppointments,
  NoMessages,
  NoDocuments,
  NoPhotos,
  NoTasks,
  NoResults,
  NoData,
} from '../EmptyState';

describe('EmptyState Component', () => {
  it('renders title', () => {
    render(<EmptyState title="No items found" />);
    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(<EmptyState title="No items" description="Add your first item to get started" />);
    expect(screen.getByText('Add your first item to get started')).toBeInTheDocument();
  });

  it('renders without description', () => {
    const { container } = render(<EmptyState title="No items" />);
    expect(container.querySelector('.empty-state-description')).not.toBeInTheDocument();
  });

  it('renders icon', () => {
    render(<EmptyState icon="📋" title="No items" />);
    expect(screen.getByText('📋')).toBeInTheDocument();
  });

  it('renders action button', () => {
    const handleAction = vi.fn();
    render(
      <EmptyState
        title="No items"
        action={{
          label: 'Add Item',
          onClick: handleAction,
        }}
      />
    );

    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument();
  });

  it('calls action onClick', async () => {
    const handleAction = vi.fn();
    const user = userEvent.setup();

    render(
      <EmptyState
        title="No items"
        action={{
          label: 'Add Item',
          onClick: handleAction,
        }}
      />
    );

    await user.click(screen.getByRole('button', { name: /add item/i }));
    expect(handleAction).toHaveBeenCalledTimes(1);
  });

  it('renders without action button', () => {
    render(<EmptyState title="No items" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <EmptyState title="No items">
        <div>Custom content</div>
      </EmptyState>
    );
    expect(screen.getByText('Custom content')).toBeInTheDocument();
  });
});

describe('NoPatients Component', () => {
  it('renders no patients message', () => {
    render(<NoPatients onAddPatient={vi.fn()} />);
    expect(screen.getByText('No patients yet')).toBeInTheDocument();
    expect(
      screen.getByText('Get started by adding your first patient to the system.')
    ).toBeInTheDocument();
  });

  it('renders add patient button', () => {
    render(<NoPatients onAddPatient={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add patient/i })).toBeInTheDocument();
  });

  it('calls onAddPatient', async () => {
    const handleAdd = vi.fn();
    const user = userEvent.setup();

    render(<NoPatients onAddPatient={handleAdd} />);
    await user.click(screen.getByRole('button', { name: /add patient/i }));

    expect(handleAdd).toHaveBeenCalledTimes(1);
  });
});

describe('NoAppointments Component', () => {
  it('renders no appointments message', () => {
    render(<NoAppointments />);
    expect(screen.getByText('No appointments scheduled')).toBeInTheDocument();
  });

  it('renders without action button', () => {
    render(<NoAppointments />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders with action button when provided', () => {
    render(<NoAppointments onAddAppointment={vi.fn()} />);
    expect(screen.getByRole('button', { name: /schedule appointment/i })).toBeInTheDocument();
  });

  it('calls onAddAppointment', async () => {
    const handleAdd = vi.fn();
    const user = userEvent.setup();

    render(<NoAppointments onAddAppointment={handleAdd} />);
    await user.click(screen.getByRole('button', { name: /schedule appointment/i }));

    expect(handleAdd).toHaveBeenCalledTimes(1);
  });
});

describe('NoMessages Component', () => {
  it('renders no messages state', () => {
    render(<NoMessages />);
    expect(screen.getByText('No messages')).toBeInTheDocument();
    expect(screen.getByText('Your inbox is empty. New messages will appear here.')).toBeInTheDocument();
  });

  it('renders without action button', () => {
    render(<NoMessages />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('NoDocuments Component', () => {
  it('renders no documents message', () => {
    render(<NoDocuments />);
    expect(screen.getByText('No documents')).toBeInTheDocument();
  });

  it('renders with upload button when provided', () => {
    render(<NoDocuments onUpload={vi.fn()} />);
    expect(screen.getByRole('button', { name: /upload document/i })).toBeInTheDocument();
  });

  it('calls onUpload', async () => {
    const handleUpload = vi.fn();
    const user = userEvent.setup();

    render(<NoDocuments onUpload={handleUpload} />);
    await user.click(screen.getByRole('button', { name: /upload document/i }));

    expect(handleUpload).toHaveBeenCalledTimes(1);
  });
});

describe('NoPhotos Component', () => {
  it('renders no photos message', () => {
    render(<NoPhotos />);
    expect(screen.getByText('No photos')).toBeInTheDocument();
    expect(screen.getByText('Clinical photos will be displayed here.')).toBeInTheDocument();
  });

  it('renders with upload button when provided', () => {
    render(<NoPhotos onUpload={vi.fn()} />);
    expect(screen.getByRole('button', { name: /upload photo/i })).toBeInTheDocument();
  });
});

describe('NoTasks Component', () => {
  it('renders no tasks message', () => {
    render(<NoTasks />);
    expect(screen.getByText('No tasks')).toBeInTheDocument();
    expect(screen.getByText('All caught up! Create a new task to stay organized.')).toBeInTheDocument();
  });

  it('renders with add task button when provided', () => {
    render(<NoTasks onAddTask={vi.fn()} />);
    expect(screen.getByRole('button', { name: /new task/i })).toBeInTheDocument();
  });
});

describe('NoResults Component', () => {
  it('renders no results message', () => {
    render(<NoResults />);
    expect(screen.getByText('No results found')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your search criteria.')).toBeInTheDocument();
  });

  it('renders with search query', () => {
    render(<NoResults query="dermatology" />);
    expect(
      screen.getByText('No results found for "dermatology". Try adjusting your search.')
    ).toBeInTheDocument();
  });
});

describe('NoData Component', () => {
  it('renders no data message', () => {
    render(<NoData />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
    expect(screen.getByText("Data will appear here once it's available.")).toBeInTheDocument();
  });

  it('renders without action button', () => {
    render(<NoData />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
