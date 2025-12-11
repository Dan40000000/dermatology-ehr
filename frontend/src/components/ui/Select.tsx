import type { SelectHTMLAttributes, ReactNode } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helpText?: string;
  children: ReactNode;
}

export function Select({
  label,
  error,
  helpText,
  id,
  className = '',
  children,
  ...props
}: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className={`form-field ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label htmlFor={selectId}>
          {label}
          {props.required && <span className="required">*</span>}
        </label>
      )}
      <select id={selectId} {...props}>
        {children}
      </select>
      {error && <span className="field-error">{error}</span>}
      {helpText && !error && <span className="help-text">{helpText}</span>}
    </div>
  );
}
