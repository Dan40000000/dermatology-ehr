/**
 * Form Components
 * Enhanced form components with validation and error handling
 */

import React, { FormHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { FieldError } from './ErrorState';

/**
 * Form wrapper with submit handling
 */
interface FormProps extends FormHTMLAttributes<HTMLFormElement> {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  children: React.ReactNode;
}

export function Form({ onSubmit, children, ...props }: FormProps) {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await onSubmit(e);
  };

  return (
    <form {...props} onSubmit={handleSubmit} noValidate>
      {children}
    </form>
  );
}

/**
 * Form field wrapper with label and error display
 */
interface FormFieldProps {
  label: string;
  name: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  name,
  error,
  required = false,
  hint,
  children,
  className = '',
}: FormFieldProps) {
  return (
    <div className={`form-field ${error ? 'has-error' : ''} ${className}`}>
      <label htmlFor={name} className="form-label">
        {label}
        {required && <span className="required-indicator" aria-label="required">*</span>}
      </label>
      {children}
      {hint && !error && <div className="form-hint">{hint}</div>}
      {error && <FieldError error={error} />}
    </div>
  );
}

/**
 * Text input with validation
 */
interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  error?: string;
  hint?: string;
}

export function FormInput({
  label,
  name,
  error,
  required,
  hint,
  className = '',
  ...props
}: FormInputProps) {
  return (
    <FormField label={label} name={name} error={error} required={required} hint={hint}>
      <input
        {...props}
        id={name}
        name={name}
        required={required}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : undefined}
        className={`form-input ${error ? 'error' : ''} ${className}`}
      />
    </FormField>
  );
}

/**
 * Textarea with validation
 */
interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  name: string;
  error?: string;
  hint?: string;
}

export function FormTextarea({
  label,
  name,
  error,
  required,
  hint,
  className = '',
  ...props
}: FormTextareaProps) {
  return (
    <FormField label={label} name={name} error={error} required={required} hint={hint}>
      <textarea
        {...props}
        id={name}
        name={name}
        required={required}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : undefined}
        className={`form-textarea ${error ? 'error' : ''} ${className}`}
      />
    </FormField>
  );
}

/**
 * Select with validation
 */
interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export function FormSelect({
  label,
  name,
  error,
  required,
  hint,
  options,
  placeholder,
  className = '',
  ...props
}: FormSelectProps) {
  return (
    <FormField label={label} name={name} error={error} required={required} hint={hint}>
      <select
        {...props}
        id={name}
        name={name}
        required={required}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : undefined}
        className={`form-select ${error ? 'error' : ''} ${className}`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}

/**
 * Checkbox with validation
 */
interface FormCheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  error?: string;
  hint?: string;
}

export function FormCheckbox({
  label,
  name,
  error,
  hint,
  className = '',
  ...props
}: FormCheckboxProps) {
  return (
    <div className={`form-field-checkbox ${error ? 'has-error' : ''} ${className}`}>
      <div className="checkbox-wrapper">
        <input
          {...props}
          type="checkbox"
          id={name}
          name={name}
          aria-invalid={!!error}
          aria-describedby={error ? `${name}-error` : undefined}
          className="form-checkbox"
        />
        <label htmlFor={name} className="checkbox-label">
          {label}
        </label>
      </div>
      {hint && !error && <div className="form-hint">{hint}</div>}
      {error && <FieldError error={error} />}
    </div>
  );
}

/**
 * Radio group with validation
 */
interface RadioOption {
  value: string;
  label: string;
}

interface FormRadioGroupProps {
  label: string;
  name: string;
  options: RadioOption[];
  value?: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
}

export function FormRadioGroup({
  label,
  name,
  options,
  value,
  onChange,
  error,
  hint,
  required = false,
  className = '',
}: FormRadioGroupProps) {
  return (
    <FormField label={label} name={name} error={error} required={required} hint={hint} className={className}>
      <div className="radio-group">
        {options.map((option) => (
          <div key={option.value} className="radio-option">
            <input
              type="radio"
              id={`${name}-${option.value}`}
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={(e) => onChange(e.target.value)}
              aria-invalid={!!error}
              className="form-radio"
            />
            <label htmlFor={`${name}-${option.value}`} className="radio-label">
              {option.label}
            </label>
          </div>
        ))}
      </div>
    </FormField>
  );
}

/**
 * Form section divider
 */
interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormSection({ title, description, children, className = '' }: FormSectionProps) {
  return (
    <div className={`form-section ${className}`}>
      <div className="form-section-header">
        <h3 className="form-section-title">{title}</h3>
        {description && <p className="form-section-description">{description}</p>}
      </div>
      <div className="form-section-content">{children}</div>
    </div>
  );
}

/**
 * Form actions (buttons)
 */
interface FormActionsProps {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export function FormActions({ children, align = 'right', className = '' }: FormActionsProps) {
  return (
    <div className={`form-actions align-${align} ${className}`}>
      {children}
    </div>
  );
}
