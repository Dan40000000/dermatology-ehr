import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '../Input';

describe('Input Component', () => {
  it('renders input with label', () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('renders input without label', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('displays error message', () => {
    render(<Input label="Email" error="Invalid email address" />);
    expect(screen.getByText('Invalid email address')).toBeInTheDocument();
    expect(screen.getByLabelText('Email').closest('.form-field')).toHaveClass('has-error');
  });

  it('displays help text when no error', () => {
    render(<Input label="Email" helpText="Enter your email" />);
    expect(screen.getByText('Enter your email')).toBeInTheDocument();
  });

  it('hides help text when error is present', () => {
    render(<Input label="Email" helpText="Enter your email" error="Invalid" />);
    expect(screen.queryByText('Enter your email')).not.toBeInTheDocument();
    expect(screen.getByText('Invalid')).toBeInTheDocument();
  });

  it('shows required indicator', () => {
    render(<Input label="Email" required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('generates id from label', () => {
    render(<Input label="Email Address" />);
    const input = screen.getByLabelText('Email Address');
    expect(input).toHaveAttribute('id', 'email-address');
  });

  it('uses custom id when provided', () => {
    render(<Input label="Email" id="custom-id" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('id', 'custom-id');
  });

  it('handles user input', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(<Input label="Name" onChange={handleChange} />);
    const input = screen.getByLabelText('Name');

    await user.type(input, 'John');
    expect(handleChange).toHaveBeenCalledTimes(4); // Once per character
  });

  it('applies custom className', () => {
    render(<Input label="Email" className="custom-class" />);
    expect(screen.getByLabelText('Email').closest('.form-field')).toHaveClass('custom-class');
  });

  it('passes through standard input attributes', () => {
    render(<Input label="Email" type="email" placeholder="email@example.com" disabled />);
    const input = screen.getByLabelText('Email');

    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('placeholder', 'email@example.com');
    expect(input).toBeDisabled();
  });

  it('supports different input types', () => {
    const { rerender } = render(<Input label="Password" type="password" />);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');

    rerender(<Input label="Number" type="number" />);
    expect(screen.getByLabelText('Number')).toHaveAttribute('type', 'number');

    rerender(<Input label="Date" type="date" />);
    expect(screen.getByLabelText('Date')).toHaveAttribute('type', 'date');
  });
});
