import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from '../Select';

describe('Select Component', () => {
  const options = (
    <>
      <option value="">Choose an option</option>
      <option value="option1">Option 1</option>
      <option value="option2">Option 2</option>
      <option value="option3">Option 3</option>
    </>
  );

  it('renders select with label', () => {
    render(<Select label="Country">{options}</Select>);
    expect(screen.getByLabelText('Country')).toBeInTheDocument();
  });

  it('renders select without label', () => {
    render(<Select>{options}</Select>);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('displays error message', () => {
    render(
      <Select label="Country" error="Please select a country">
        {options}
      </Select>
    );
    expect(screen.getByText('Please select a country')).toBeInTheDocument();
    expect(screen.getByLabelText('Country').closest('.form-field')).toHaveClass('has-error');
  });

  it('displays help text when no error', () => {
    render(
      <Select label="Country" helpText="Select your country">
        {options}
      </Select>
    );
    expect(screen.getByText('Select your country')).toBeInTheDocument();
  });

  it('hides help text when error is present', () => {
    render(
      <Select label="Country" helpText="Select your country" error="Required">
        {options}
      </Select>
    );
    expect(screen.queryByText('Select your country')).not.toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('shows required indicator', () => {
    render(
      <Select label="Country" required>
        {options}
      </Select>
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('generates id from label', () => {
    render(<Select label="Country Name">{options}</Select>);
    const select = screen.getByLabelText('Country Name');
    expect(select).toHaveAttribute('id', 'country-name');
  });

  it('uses custom id when provided', () => {
    render(
      <Select label="Country" id="custom-select">
        {options}
      </Select>
    );
    const select = screen.getByLabelText('Country');
    expect(select).toHaveAttribute('id', 'custom-select');
  });

  it('handles user selection', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(
      <Select label="Country" onChange={handleChange}>
        {options}
      </Select>
    );

    const select = screen.getByLabelText('Country');
    await user.selectOptions(select, 'option2');

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(select).toHaveValue('option2');
  });

  it('applies custom className', () => {
    render(
      <Select label="Country" className="custom-class">
        {options}
      </Select>
    );
    expect(screen.getByLabelText('Country').closest('.form-field')).toHaveClass('custom-class');
  });

  it('passes through standard select attributes', () => {
    render(
      <Select label="Country" disabled required>
        {options}
      </Select>
    );
    const select = screen.getByLabelText('Country');

    expect(select).toBeDisabled();
    expect(select).toBeRequired();
  });

  it('renders all options', () => {
    render(<Select label="Country">{options}</Select>);

    expect(screen.getByRole('option', { name: 'Choose an option' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Option 1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Option 2' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Option 3' })).toBeInTheDocument();
  });

  it('supports multiple selection', async () => {
    const user = userEvent.setup();

    render(
      <Select label="Countries" multiple>
        {options}
      </Select>
    );

    const select = screen.getByLabelText('Countries') as HTMLSelectElement;
    await user.selectOptions(select, ['option1', 'option2']);

    const selectedOptions = Array.from(select.selectedOptions).map(opt => opt.value);
    expect(selectedOptions).toEqual(['option1', 'option2']);
  });
});
