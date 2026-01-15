import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrderFilters } from '../OrderFilters';
import type { OrderType, OrderStatus, OrderPriority, OrderGroupBy } from '../../../types';

describe('OrderFilters', () => {
  const mockProps = {
    selectedOrderTypes: [] as OrderType[],
    selectedStatuses: [] as OrderStatus[],
    selectedPriorities: [] as OrderPriority[],
    searchTerm: '',
    groupBy: 'none' as OrderGroupBy,
    onOrderTypesChange: vi.fn(),
    onStatusesChange: vi.fn(),
    onPrioritiesChange: vi.fn(),
    onSearchChange: vi.fn(),
    onGroupByChange: vi.fn(),
    onClearFilters: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all filter sections', () => {
    render(<OrderFilters {...mockProps} />);

    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByText('Order Type')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByText('Group By')).toBeInTheDocument();
  });

  it('handles search input change', () => {
    render(<OrderFilters {...mockProps} />);

    const searchInput = screen.getByPlaceholderText('Search orders...');
    fireEvent.change(searchInput, { target: { value: 'test search' } });

    expect(mockProps.onSearchChange).toHaveBeenCalledWith('test search');
  });

  it('toggles individual order type', () => {
    render(<OrderFilters {...mockProps} />);

    const labCheckbox = screen.getByLabelText('Labs');
    fireEvent.click(labCheckbox);

    expect(mockProps.onOrderTypesChange).toHaveBeenCalledWith(['lab']);
  });

  it('selects all order types', () => {
    render(<OrderFilters {...mockProps} />);

    // Find the Select All checkbox in Order Type section
    const checkboxes = screen.getAllByRole('checkbox');
    const selectAllCheckbox = checkboxes.find((cb) => {
      const label = cb.closest('label');
      return label?.textContent?.includes('Select All');
    });

    if (selectAllCheckbox) {
      fireEvent.click(selectAllCheckbox);
      expect(mockProps.onOrderTypesChange).toHaveBeenCalled();
    }
  });

  it('toggles individual status', () => {
    render(<OrderFilters {...mockProps} />);

    const openCheckbox = screen.getByLabelText('Open');
    fireEvent.click(openCheckbox);

    expect(mockProps.onStatusesChange).toHaveBeenCalledWith(['open']);
  });

  it('toggles individual priority', () => {
    render(<OrderFilters {...mockProps} />);

    const statCheckbox = screen.getByLabelText('STAT');
    fireEvent.click(statCheckbox);

    expect(mockProps.onPrioritiesChange).toHaveBeenCalledWith(['stat']);
  });

  it('changes group by option', () => {
    render(<OrderFilters {...mockProps} />);

    const patientRadio = screen.getByLabelText('Patient');
    fireEvent.click(patientRadio);

    expect(mockProps.onGroupByChange).toHaveBeenCalledWith('patient');
  });

  it('clears all filters', () => {
    render(<OrderFilters {...mockProps} />);

    const clearButton = screen.getByText('Clear All Filters');
    fireEvent.click(clearButton);

    expect(mockProps.onClearFilters).toHaveBeenCalled();
  });

  it('displays selected order types', () => {
    const props = {
      ...mockProps,
      selectedOrderTypes: ['lab', 'pathology'] as OrderType[],
    };

    render(<OrderFilters {...props} />);

    const labCheckbox = screen.getByLabelText('Labs');
    const pathologyCheckbox = screen.getByLabelText('Pathology');

    expect(labCheckbox).toBeChecked();
    expect(pathologyCheckbox).toBeChecked();
  });

  it('displays selected statuses', () => {
    const props = {
      ...mockProps,
      selectedStatuses: ['open', 'in-progress'] as OrderStatus[],
    };

    render(<OrderFilters {...props} />);

    const openCheckbox = screen.getByLabelText('Open');
    const inProgressCheckbox = screen.getByLabelText('In Progress');

    expect(openCheckbox).toBeChecked();
    expect(inProgressCheckbox).toBeChecked();
  });

  it('displays selected priorities', () => {
    const props = {
      ...mockProps,
      selectedPriorities: ['high', 'stat'] as OrderPriority[],
    };

    render(<OrderFilters {...props} />);

    const highCheckbox = screen.getByLabelText('High');
    const statCheckbox = screen.getByLabelText('STAT');

    expect(highCheckbox).toBeChecked();
    expect(statCheckbox).toBeChecked();
  });

  it('displays current group by selection', () => {
    const props = {
      ...mockProps,
      groupBy: 'patient' as OrderGroupBy,
    };

    render(<OrderFilters {...props} />);

    const patientRadio = screen.getByLabelText('Patient');
    expect(patientRadio).toBeChecked();
  });

  it('deselects order type when already selected', () => {
    const props = {
      ...mockProps,
      selectedOrderTypes: ['lab'] as OrderType[],
    };

    render(<OrderFilters {...props} />);

    const labCheckbox = screen.getByLabelText('Labs');
    fireEvent.click(labCheckbox);

    expect(mockProps.onOrderTypesChange).toHaveBeenCalledWith([]);
  });

  it('displays all order type options', () => {
    render(<OrderFilters {...mockProps} />);

    expect(screen.getByLabelText('Follow Up')).toBeInTheDocument();
    expect(screen.getByLabelText('Infusion')).toBeInTheDocument();
    expect(screen.getByLabelText('Injection')).toBeInTheDocument();
    expect(screen.getByLabelText('Labs')).toBeInTheDocument();
    expect(screen.getByLabelText('Pathology')).toBeInTheDocument();
    expect(screen.getByLabelText('Radiology')).toBeInTheDocument();
    expect(screen.getByLabelText('Referral')).toBeInTheDocument();
    expect(screen.getByLabelText('Surgery')).toBeInTheDocument();
  });

  it('displays all status options', () => {
    render(<OrderFilters {...mockProps} />);

    expect(screen.getByLabelText('Open')).toBeInTheDocument();
    expect(screen.getByLabelText('Sent')).toBeInTheDocument();
    expect(screen.getByLabelText('In Progress')).toBeInTheDocument();
    expect(screen.getByLabelText('Closed')).toBeInTheDocument();
    expect(screen.getByLabelText('Canceled')).toBeInTheDocument();
  });

  it('displays all priority options with correct colors', () => {
    render(<OrderFilters {...mockProps} />);

    const normalLabel = screen.getByLabelText('Normal');
    const highLabel = screen.getByLabelText('High');
    const statLabel = screen.getByLabelText('STAT');

    expect(normalLabel).toBeInTheDocument();
    expect(highLabel).toBeInTheDocument();
    expect(statLabel).toBeInTheDocument();
  });
});
