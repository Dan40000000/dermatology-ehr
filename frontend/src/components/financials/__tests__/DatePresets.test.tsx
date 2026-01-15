import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DatePresets } from '../DatePresets';

describe('DatePresets', () => {
  it('renders all preset buttons', () => {
    const mockOnChange = vi.fn();
    render(<DatePresets onDateRangeChange={mockOnChange} />);

    expect(screen.getByText('Current Day')).toBeInTheDocument();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('Last 7 Days')).toBeInTheDocument();
    expect(screen.getByText('Last 30 Days')).toBeInTheDocument();
    expect(screen.getByText('This Month')).toBeInTheDocument();
    expect(screen.getByText('Custom Range')).toBeInTheDocument();
  });

  it('calls onDateRangeChange when Current Day is clicked', () => {
    const mockOnChange = vi.fn();
    render(<DatePresets onDateRangeChange={mockOnChange} />);

    fireEvent.click(screen.getByText('Current Day'));

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    expect(mockOnChange).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String)
    );

    // Verify both start and end are today's date
    const [start, end] = mockOnChange.mock.calls[0];
    expect(start).toBe(end);
  });

  it('calls onDateRangeChange when Last 7 Days is clicked', () => {
    const mockOnChange = vi.fn();
    render(<DatePresets onDateRangeChange={mockOnChange} />);

    fireEvent.click(screen.getByText('Last 7 Days'));

    expect(mockOnChange).toHaveBeenCalledTimes(1);

    const [start, end] = mockOnChange.mock.calls[0];
    const startDate = new Date(start);
    const endDate = new Date(end);

    // Verify the range is approximately 7 days
    const daysDiff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(daysDiff).toBe(7);
  });

  it('shows custom date inputs when Custom Range is clicked', () => {
    const mockOnChange = vi.fn();
    render(<DatePresets onDateRangeChange={mockOnChange} />);

    fireEvent.click(screen.getByText('Custom Range'));

    const dateInputs = screen.getAllByDisplayValue('');
    expect(dateInputs.length).toBeGreaterThan(0);
    expect(screen.getByText('Apply')).toBeInTheDocument();
  });

  it('applies custom date range when Apply is clicked', () => {
    const mockOnChange = vi.fn();
    render(<DatePresets onDateRangeChange={mockOnChange} />);

    fireEvent.click(screen.getByText('Custom Range'));

    const dateInputs = document.querySelectorAll('input[type="date"]');
    const startInput = dateInputs[0];
    const endInput = dateInputs[1];

    fireEvent.change(startInput, { target: { value: '2026-01-01' } });
    fireEvent.change(endInput, { target: { value: '2026-01-31' } });

    fireEvent.click(screen.getByText('Apply'));

    expect(mockOnChange).toHaveBeenCalledWith('2026-01-01', '2026-01-31');
  });

  it('highlights active preset button', () => {
    const mockOnChange = vi.fn();
    render(<DatePresets onDateRangeChange={mockOnChange} />);

    const todayButton = screen.getByText('Current Day');
    fireEvent.click(todayButton);

    // Check if button has active styling (background color changed)
    expect(todayButton).toHaveStyle({ background: '#059669' });
  });

  it('changes active preset when different button is clicked', () => {
    const mockOnChange = vi.fn();
    render(<DatePresets onDateRangeChange={mockOnChange} />);

    const todayButton = screen.getByText('Current Day');
    const last7Button = screen.getByText('Last 7 Days');

    fireEvent.click(todayButton);
    expect(todayButton).toHaveStyle({ background: '#059669' });

    fireEvent.click(last7Button);
    expect(last7Button).toHaveStyle({ background: '#059669' });
    expect(todayButton).toHaveStyle({ background: 'white' });
  });
});
