import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Form,
  FormField,
  FormInput,
  FormTextarea,
  FormSelect,
  FormCheckbox,
  FormRadioGroup,
  FormSection,
  FormActions,
} from '../Form';

describe('Form Component', () => {
  it('renders form and prevents default submission', async () => {
    const handleSubmit = vi.fn((e) => {});
    const user = userEvent.setup();

    render(
      <Form onSubmit={handleSubmit}>
        <button type="submit">Submit</button>
      </Form>
    );

    await user.click(screen.getByRole('button', { name: /submit/i }));
    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });

  it('supports async submit handlers', async () => {
    const handleSubmit = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    const user = userEvent.setup();

    render(
      <Form onSubmit={handleSubmit}>
        <button type="submit">Submit</button>
      </Form>
    );

    await user.click(screen.getByRole('button', { name: /submit/i }));
    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('FormField Component', () => {
  it('renders label and children', () => {
    render(
      <FormField label="Username" name="username">
        <input type="text" />
      </FormField>
    );

    expect(screen.getByText('Username')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('shows required indicator', () => {
    render(
      <FormField label="Username" name="username" required>
        <input type="text" />
      </FormField>
    );

    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('displays hint text', () => {
    render(
      <FormField label="Password" name="password" hint="Must be at least 8 characters">
        <input type="password" />
      </FormField>
    );

    expect(screen.getByText('Must be at least 8 characters')).toBeInTheDocument();
  });

  it('displays error message', () => {
    render(
      <FormField label="Email" name="email" error="Invalid email">
        <input type="email" />
      </FormField>
    );

    expect(screen.getByText('Invalid email')).toBeInTheDocument();
    expect(screen.getByText('Email').closest('.form-field')).toHaveClass('has-error');
  });

  it('hides hint when error is present', () => {
    render(
      <FormField label="Email" name="email" hint="Enter your email" error="Invalid">
        <input type="email" />
      </FormField>
    );

    expect(screen.queryByText('Enter your email')).not.toBeInTheDocument();
    expect(screen.getByText('Invalid')).toBeInTheDocument();
  });
});

describe('FormInput Component', () => {
  it('renders input with label', () => {
    render(<FormInput label="Email" name="email" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('applies error styling', () => {
    render(<FormInput label="Email" name="email" error="Invalid email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveClass('error');
  });

  it('handles user input', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(<FormInput label="Name" name="name" onChange={handleChange} />);
    await user.type(screen.getByLabelText('Name'), 'John');

    expect(handleChange).toHaveBeenCalled();
  });
});

describe('FormTextarea Component', () => {
  it('renders textarea with label', () => {
    render(<FormTextarea label="Description" name="description" />);
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });

  it('applies error styling', () => {
    render(<FormTextarea label="Description" name="description" error="Required" />);
    const textarea = screen.getByLabelText('Description');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveClass('error');
  });

  it('handles user input', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(<FormTextarea label="Notes" name="notes" onChange={handleChange} />);
    await user.type(screen.getByLabelText('Notes'), 'Test note');

    expect(handleChange).toHaveBeenCalled();
  });
});

describe('FormSelect Component', () => {
  const options = [
    { value: '1', label: 'Option 1' },
    { value: '2', label: 'Option 2' },
    { value: '3', label: 'Option 3' },
  ];

  it('renders select with options', () => {
    render(<FormSelect label="Country" name="country" options={options} />);

    expect(screen.getByLabelText('Country')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Option 1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Option 2' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Option 3' })).toBeInTheDocument();
  });

  it('renders placeholder option', () => {
    render(
      <FormSelect label="Country" name="country" options={options} placeholder="Select a country" />
    );

    expect(screen.getByRole('option', { name: 'Select a country' })).toBeInTheDocument();
  });

  it('handles selection change', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(<FormSelect label="Country" name="country" options={options} onChange={handleChange} />);

    await user.selectOptions(screen.getByLabelText('Country'), '2');
    expect(handleChange).toHaveBeenCalled();
  });
});

describe('FormCheckbox Component', () => {
  it('renders checkbox with label', () => {
    render(<FormCheckbox label="Accept terms" name="terms" />);
    expect(screen.getByLabelText('Accept terms')).toBeInTheDocument();
  });

  it('handles checkbox toggle', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(<FormCheckbox label="Accept terms" name="terms" onChange={handleChange} />);

    const checkbox = screen.getByLabelText('Accept terms');
    await user.click(checkbox);

    expect(handleChange).toHaveBeenCalled();
    expect(checkbox).toBeChecked();
  });

  it('displays error', () => {
    render(<FormCheckbox label="Accept terms" name="terms" error="You must accept" />);
    expect(screen.getByText('You must accept')).toBeInTheDocument();
  });

  it('displays hint', () => {
    render(<FormCheckbox label="Newsletter" name="newsletter" hint="We'll send updates monthly" />);
    expect(screen.getByText("We'll send updates monthly")).toBeInTheDocument();
  });
});

describe('FormRadioGroup Component', () => {
  const options = [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
    { value: 'other', label: 'Other' },
  ];

  it('renders radio group with options', () => {
    render(<FormRadioGroup label="Gender" name="gender" options={options} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Male')).toBeInTheDocument();
    expect(screen.getByLabelText('Female')).toBeInTheDocument();
    expect(screen.getByLabelText('Other')).toBeInTheDocument();
  });

  it('handles selection', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(<FormRadioGroup label="Gender" name="gender" options={options} onChange={handleChange} />);

    await user.click(screen.getByLabelText('Female'));
    expect(handleChange).toHaveBeenCalledWith('female');
  });

  it('shows selected value', () => {
    render(
      <FormRadioGroup label="Gender" name="gender" options={options} value="male" onChange={vi.fn()} />
    );

    expect(screen.getByLabelText('Male')).toBeChecked();
    expect(screen.getByLabelText('Female')).not.toBeChecked();
  });

  it('displays error', () => {
    render(
      <FormRadioGroup
        label="Gender"
        name="gender"
        options={options}
        error="Required"
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('Required')).toBeInTheDocument();
  });
});

describe('FormSection Component', () => {
  it('renders section with title', () => {
    render(
      <FormSection title="Personal Information">
        <div>Content</div>
      </FormSection>
    );

    expect(screen.getByText('Personal Information')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(
      <FormSection title="Settings" description="Configure your preferences">
        <div>Content</div>
      </FormSection>
    );

    expect(screen.getByText('Configure your preferences')).toBeInTheDocument();
  });
});

describe('FormActions Component', () => {
  it('renders children', () => {
    render(
      <FormActions>
        <button>Cancel</button>
        <button>Save</button>
      </FormActions>
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('applies alignment class', () => {
    const { container } = render(
      <FormActions align="center">
        <button>Save</button>
      </FormActions>
    );

    expect(container.firstChild).toHaveClass('align-center');
  });
});
