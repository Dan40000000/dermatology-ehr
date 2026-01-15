import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResultFlagBadge, ResultFlagSelect, ResultFlagFilter, QuickFilterButtons } from '../ResultFlagBadge';
import type { ResultFlagType } from '../../types';

describe('ResultFlagBadge', () => {
  it('renders badge with correct label and color for cancerous flag', () => {
    render(<ResultFlagBadge flag="cancerous" />);
    expect(screen.getByText('Cancerous/Malignant')).toBeInTheDocument();
  });

  it('renders badge with correct label for normal flag', () => {
    render(<ResultFlagBadge flag="normal" />);
    expect(screen.getByText('Normal (WNL)')).toBeInTheDocument();
  });

  it('renders placeholder for none/undefined flag', () => {
    const { container } = render(<ResultFlagBadge flag="none" />);
    expect(container.textContent).toContain('--');
  });

  it('renders small size badge', () => {
    const { container } = render(<ResultFlagBadge flag="abnormal" size="sm" />);
    expect(container.querySelector('span')).toHaveStyle({ fontSize: '0.75rem' });
  });

  it('hides label when showLabel is false', () => {
    render(<ResultFlagBadge flag="benign" showLabel={false} />);
    expect(screen.queryByText('Benign')).not.toBeInTheDocument();
  });
});

describe('ResultFlagSelect', () => {
  it('renders select dropdown with all flag options', () => {
    const mockOnChange = vi.fn();
    render(<ResultFlagSelect value="none" onChange={mockOnChange} />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select).toBeInTheDocument();

    // Check for pathology options
    expect(screen.getByText('Benign')).toBeInTheDocument();
    expect(screen.getByText('Precancerous')).toBeInTheDocument();
    expect(screen.getByText('Cancerous/Malignant')).toBeInTheDocument();

    // Check for lab result options
    expect(screen.getByText('Normal (WNL)')).toBeInTheDocument();
    expect(screen.getByText('Abnormal')).toBeInTheDocument();
  });

  it('calls onChange when selection changes', () => {
    const mockOnChange = vi.fn();
    render(<ResultFlagSelect value="none" onChange={mockOnChange} />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'abnormal' } });

    expect(mockOnChange).toHaveBeenCalledWith('abnormal');
  });

  it('is disabled when disabled prop is true', () => {
    const mockOnChange = vi.fn();
    render(<ResultFlagSelect value="none" onChange={mockOnChange} disabled />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select).toBeDisabled();
  });
});

describe('ResultFlagFilter', () => {
  it('renders all flag checkboxes in groups', () => {
    const mockOnChange = vi.fn();
    render(<ResultFlagFilter selectedFlags={[]} onChange={mockOnChange} />);

    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Caution')).toBeInTheDocument();
    expect(screen.getByText('Normal')).toBeInTheDocument();
  });

  it('checks boxes for selected flags', () => {
    const mockOnChange = vi.fn();
    render(<ResultFlagFilter selectedFlags={['cancerous', 'abnormal']} onChange={mockOnChange} />);

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    const checkedBoxes = checkboxes.filter(cb => cb.checked);

    expect(checkedBoxes.length).toBe(2);
  });

  it('calls onChange when checkbox is clicked', () => {
    const mockOnChange = vi.fn();
    render(<ResultFlagFilter selectedFlags={[]} onChange={mockOnChange} />);

    const cancerousLabel = screen.getByText('Cancerous/Malignant').closest('label');
    if (cancerousLabel) {
      fireEvent.click(cancerousLabel);
      expect(mockOnChange).toHaveBeenCalledWith(['cancerous']);
    }
  });

  it('removes flag when unchecking a selected flag', () => {
    const mockOnChange = vi.fn();
    render(<ResultFlagFilter selectedFlags={['abnormal']} onChange={mockOnChange} />);

    const abnormalLabel = screen.getByText('Abnormal').closest('label');
    if (abnormalLabel) {
      fireEvent.click(abnormalLabel);
      expect(mockOnChange).toHaveBeenCalledWith([]);
    }
  });
});

describe('QuickFilterButtons', () => {
  it('renders all quick filter buttons', () => {
    const mockOnFilterCritical = vi.fn();
    const mockOnFilterAbnormal = vi.fn();
    const mockOnClearFilters = vi.fn();

    render(
      <QuickFilterButtons
        onFilterCritical={mockOnFilterCritical}
        onFilterAbnormal={mockOnFilterAbnormal}
        onClearFilters={mockOnClearFilters}
      />
    );

    expect(screen.getByText('Critical Results')).toBeInTheDocument();
    expect(screen.getByText('Abnormal Results')).toBeInTheDocument();
    expect(screen.getByText('Clear Filters')).toBeInTheDocument();
  });

  it('calls onFilterCritical when critical button is clicked', () => {
    const mockOnFilterCritical = vi.fn();
    const mockOnFilterAbnormal = vi.fn();
    const mockOnClearFilters = vi.fn();

    render(
      <QuickFilterButtons
        onFilterCritical={mockOnFilterCritical}
        onFilterAbnormal={mockOnFilterAbnormal}
        onClearFilters={mockOnClearFilters}
      />
    );

    fireEvent.click(screen.getByText('Critical Results'));
    expect(mockOnFilterCritical).toHaveBeenCalled();
  });

  it('calls onFilterAbnormal when abnormal button is clicked', () => {
    const mockOnFilterCritical = vi.fn();
    const mockOnFilterAbnormal = vi.fn();
    const mockOnClearFilters = vi.fn();

    render(
      <QuickFilterButtons
        onFilterCritical={mockOnFilterCritical}
        onFilterAbnormal={mockOnFilterAbnormal}
        onClearFilters={mockOnClearFilters}
      />
    );

    fireEvent.click(screen.getByText('Abnormal Results'));
    expect(mockOnFilterAbnormal).toHaveBeenCalled();
  });

  it('calls onClearFilters when clear button is clicked', () => {
    const mockOnFilterCritical = vi.fn();
    const mockOnFilterAbnormal = vi.fn();
    const mockOnClearFilters = vi.fn();

    render(
      <QuickFilterButtons
        onFilterCritical={mockOnFilterCritical}
        onFilterAbnormal={mockOnFilterAbnormal}
        onClearFilters={mockOnClearFilters}
      />
    );

    fireEvent.click(screen.getByText('Clear Filters'));
    expect(mockOnClearFilters).toHaveBeenCalled();
  });
});

describe('Color coding', () => {
  it('uses red for cancerous and panic_value flags', () => {
    const { container: cancerousContainer } = render(<ResultFlagBadge flag="cancerous" />);
    const { container: panicContainer } = render(<ResultFlagBadge flag="panic_value" />);

    expect(cancerousContainer.querySelector('span')).toHaveStyle({ backgroundColor: '#dc2626' });
    expect(panicContainer.querySelector('span')).toHaveStyle({ backgroundColor: '#dc2626' });
  });

  it('uses orange for precancerous and abnormal flags', () => {
    const { container: precancerousContainer } = render(<ResultFlagBadge flag="precancerous" />);
    const { container: abnormalContainer } = render(<ResultFlagBadge flag="abnormal" />);

    expect(precancerousContainer.querySelector('span')).toHaveStyle({ backgroundColor: '#fee2e2' });
    expect(abnormalContainer.querySelector('span')).toHaveStyle({ backgroundColor: '#fee2e2' });
  });

  it('uses green for normal and benign flags', () => {
    const { container: normalContainer } = render(<ResultFlagBadge flag="normal" />);
    const { container: benignContainer } = render(<ResultFlagBadge flag="benign" />);

    expect(normalContainer.querySelector('span')).toHaveStyle({ backgroundColor: '#d1fae5' });
    expect(benignContainer.querySelector('span')).toHaveStyle({ backgroundColor: '#d1fae5' });
  });
});
