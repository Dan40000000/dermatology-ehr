import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuickFilters } from '../QuickFilters';
import type { OrderFilters } from '../../../types';

describe('QuickFilters', () => {
  const mockOnLoadFilter = vi.fn();
  const mockCurrentFilters: OrderFilters = {
    orderTypes: ['lab'],
    statuses: ['open'],
    priorities: ['normal'],
    searchTerm: '',
    groupBy: 'none',
  };

  beforeEach(() => {
    localStorage.clear();
    mockOnLoadFilter.mockClear();
  });

  it('renders without crashing', () => {
    render(<QuickFilters onLoadFilter={mockOnLoadFilter} currentFilters={mockCurrentFilters} />);
    expect(screen.getByText('My Quick Filters')).toBeInTheDocument();
  });

  it('shows empty state when no filters are saved', () => {
    render(<QuickFilters onLoadFilter={mockOnLoadFilter} currentFilters={mockCurrentFilters} />);
    expect(screen.getByText(/No saved filters/i)).toBeInTheDocument();
  });

  it('opens save dialog when clicking Save Current Filter button', () => {
    render(<QuickFilters onLoadFilter={mockOnLoadFilter} currentFilters={mockCurrentFilters} />);
    const saveButton = screen.getByText('+ Save Current Filter');
    fireEvent.click(saveButton);
    expect(screen.getByText('Save Quick Filter')).toBeInTheDocument();
  });

  it('saves a new filter to localStorage', async () => {
    render(<QuickFilters onLoadFilter={mockOnLoadFilter} currentFilters={mockCurrentFilters} />);

    // Open save dialog
    const saveButton = screen.getByText('+ Save Current Filter');
    fireEvent.click(saveButton);

    // Enter filter name
    const input = screen.getByPlaceholderText('Filter name...');
    fireEvent.change(input, { target: { value: 'My Test Filter' } });

    // Click save
    const confirmButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText('My Test Filter')).toBeInTheDocument();
    });

    // Check localStorage
    const stored = localStorage.getItem('orders_quick_filters');
    expect(stored).toBeTruthy();
    const filters = JSON.parse(stored!);
    expect(filters).toHaveLength(1);
    expect(filters[0].name).toBe('My Test Filter');
  });

  it('loads a saved filter when clicked', async () => {
    const savedFilters = [
      {
        id: '1',
        name: 'Lab Orders Only',
        orderTypes: ['lab'],
        statuses: ['open'],
        priorities: ['normal'],
        searchTerm: '',
        groupBy: 'none',
      },
    ];
    localStorage.setItem('orders_quick_filters', JSON.stringify(savedFilters));

    render(<QuickFilters onLoadFilter={mockOnLoadFilter} currentFilters={mockCurrentFilters} />);

    const filterButton = screen.getByText('Lab Orders Only');
    fireEvent.click(filterButton);

    expect(mockOnLoadFilter).toHaveBeenCalledWith({
      orderTypes: ['lab'],
      statuses: ['open'],
      priorities: ['normal'],
      searchTerm: '',
      groupBy: 'none',
    });
  });

  it('edits a saved filter', async () => {
    const savedFilters = [
      {
        id: '1',
        name: 'Original Name',
        orderTypes: ['lab'],
        statuses: ['open'],
        priorities: ['normal'],
        searchTerm: '',
        groupBy: 'none',
      },
    ];
    localStorage.setItem('orders_quick_filters', JSON.stringify(savedFilters));

    render(<QuickFilters onLoadFilter={mockOnLoadFilter} currentFilters={mockCurrentFilters} />);

    // Click edit button
    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    // Change name
    const input = screen.getByPlaceholderText('Filter name...');
    fireEvent.change(input, { target: { value: 'Updated Name' } });

    // Click update
    const updateButton = screen.getByRole('button', { name: 'Update' });
    fireEvent.click(updateButton);

    await waitFor(() => {
      expect(screen.getByText('Updated Name')).toBeInTheDocument();
      expect(screen.queryByText('Original Name')).not.toBeInTheDocument();
    });
  });

  it('deletes a saved filter with confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const savedFilters = [
      {
        id: '1',
        name: 'Filter to Delete',
        orderTypes: ['lab'],
        statuses: ['open'],
        priorities: ['normal'],
        searchTerm: '',
        groupBy: 'none',
      },
    ];
    localStorage.setItem('orders_quick_filters', JSON.stringify(savedFilters));

    render(<QuickFilters onLoadFilter={mockOnLoadFilter} currentFilters={mockCurrentFilters} />);

    // Click delete button
    const deleteButton = screen.getByText('X');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.queryByText('Filter to Delete')).not.toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });

  it('cancels delete when user declines confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const savedFilters = [
      {
        id: '1',
        name: 'Filter to Keep',
        orderTypes: ['lab'],
        statuses: ['open'],
        priorities: ['normal'],
        searchTerm: '',
        groupBy: 'none',
      },
    ];
    localStorage.setItem('orders_quick_filters', JSON.stringify(savedFilters));

    render(<QuickFilters onLoadFilter={mockOnLoadFilter} currentFilters={mockCurrentFilters} />);

    // Click delete button
    const deleteButton = screen.getByText('X');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText('Filter to Keep')).toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });

  it('handles multiple saved filters', () => {
    const savedFilters = [
      {
        id: '1',
        name: 'Filter One',
        orderTypes: ['lab'],
        statuses: ['open'],
        priorities: ['normal'],
        searchTerm: '',
        groupBy: 'none',
      },
      {
        id: '2',
        name: 'Filter Two',
        orderTypes: ['pathology'],
        statuses: ['in-progress'],
        priorities: ['high'],
        searchTerm: '',
        groupBy: 'patient',
      },
    ];
    localStorage.setItem('orders_quick_filters', JSON.stringify(savedFilters));

    render(<QuickFilters onLoadFilter={mockOnLoadFilter} currentFilters={mockCurrentFilters} />);

    expect(screen.getByText('Filter One')).toBeInTheDocument();
    expect(screen.getByText('Filter Two')).toBeInTheDocument();
  });

  it('does not save filter with empty name', () => {
    render(<QuickFilters onLoadFilter={mockOnLoadFilter} currentFilters={mockCurrentFilters} />);

    // Open save dialog
    const saveButton = screen.getByText('+ Save Current Filter');
    fireEvent.click(saveButton);

    // Click save without entering name
    const confirmButton = screen.getByRole('button', { name: 'Save' });
    expect(confirmButton).toBeDisabled();
  });
});
