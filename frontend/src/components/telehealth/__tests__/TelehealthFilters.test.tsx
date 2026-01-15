import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TelehealthFilters, { DERMATOLOGY_REASONS } from '../TelehealthFilters';

describe('TelehealthFilters', () => {
  const mockFilters = {
    datePreset: 'alltime',
    startDate: '',
    endDate: '',
    status: '',
    assignedTo: '',
    physician: '',
    reason: '',
    myUnreadOnly: false,
  };

  const mockProviders = [
    { id: 1, fullName: 'Dr. John Smith' },
    { id: 2, name: 'Dr. Jane Doe' },
  ];

  const mockOnChange = vi.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it('renders all filter fields', () => {
    render(
      <TelehealthFilters filters={mockFilters} onChange={mockOnChange} providers={mockProviders} />
    );

    expect(screen.getByLabelText('Date Range')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Reason for Visit')).toBeInTheDocument();
    expect(screen.getByLabelText('Assigned To')).toBeInTheDocument();
    expect(screen.getByLabelText('Physician')).toBeInTheDocument();
    expect(screen.getByText('My Unread Only')).toBeInTheDocument();
  });

  it('shows custom date fields when custom preset is selected', () => {
    const customFilters = { ...mockFilters, datePreset: 'custom' };

    render(
      <TelehealthFilters
        filters={customFilters}
        onChange={mockOnChange}
        providers={mockProviders}
      />
    );

    expect(screen.getByLabelText('Start Date')).toBeInTheDocument();
    expect(screen.getByLabelText('End Date')).toBeInTheDocument();
  });

  it('calls onChange when date preset changes', () => {
    render(
      <TelehealthFilters filters={mockFilters} onChange={mockOnChange} providers={mockProviders} />
    );

    const dateSelect = screen.getByLabelText('Date Range');
    fireEvent.change(dateSelect, { target: { value: 'today' } });

    expect(mockOnChange).toHaveBeenCalled();
    const callArgs = mockOnChange.mock.calls[0][0];
    expect(callArgs.datePreset).toBe('today');
    expect(callArgs.startDate).toBeTruthy();
  });

  it('calls onChange when status filter changes', () => {
    render(
      <TelehealthFilters filters={mockFilters} onChange={mockOnChange} providers={mockProviders} />
    );

    const statusSelect = screen.getByLabelText('Status');
    fireEvent.change(statusSelect, { target: { value: 'in_progress' } });

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'in_progress' })
    );
  });

  it('renders all dermatology reasons in dropdown', () => {
    render(
      <TelehealthFilters filters={mockFilters} onChange={mockOnChange} providers={mockProviders} />
    );

    const reasonSelect = screen.getByLabelText('Reason for Visit');
    const options = reasonSelect.querySelectorAll('option');

    // +1 for "All Reasons" option
    expect(options).toHaveLength(DERMATOLOGY_REASONS.length + 1);
  });

  it('renders provider options in Assigned To dropdown', () => {
    render(
      <TelehealthFilters filters={mockFilters} onChange={mockOnChange} providers={mockProviders} />
    );

    const assignedToSelect = screen.getByLabelText('Assigned To');
    const options = assignedToSelect.querySelectorAll('option');

    // Should have "All Staff" + 2 providers = 3 options
    expect(options.length).toBeGreaterThanOrEqual(3);

    // Check that provider names are in the options
    const optionTexts = Array.from(options).map((opt) => opt.textContent);
    expect(optionTexts).toContain('Dr. John Smith');
    expect(optionTexts).toContain('Dr. Jane Doe');
  });

  it('calls onChange when checkbox is toggled', () => {
    render(
      <TelehealthFilters filters={mockFilters} onChange={mockOnChange} providers={mockProviders} />
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({ myUnreadOnly: true })
    );
  });

  it('sets correct date range for "Last 7 Days" preset', () => {
    render(
      <TelehealthFilters filters={mockFilters} onChange={mockOnChange} providers={mockProviders} />
    );

    const dateSelect = screen.getByLabelText('Date Range');
    fireEvent.change(dateSelect, { target: { value: 'last7days' } });

    const callArgs = mockOnChange.mock.calls[0][0];
    expect(callArgs.datePreset).toBe('last7days');
    expect(callArgs.startDate).toBeTruthy();
    expect(callArgs.endDate).toBeTruthy();
  });

  it('clears date range for "All Time" preset', () => {
    const filtersWithDates = {
      ...mockFilters,
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    };

    render(
      <TelehealthFilters
        filters={filtersWithDates}
        onChange={mockOnChange}
        providers={mockProviders}
      />
    );

    const dateSelect = screen.getByLabelText('Date Range');
    fireEvent.change(dateSelect, { target: { value: 'alltime' } });

    const callArgs = mockOnChange.mock.calls[0][0];
    expect(callArgs.startDate).toBe('');
    expect(callArgs.endDate).toBe('');
  });
});
