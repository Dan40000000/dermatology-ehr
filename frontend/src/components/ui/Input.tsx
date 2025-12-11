import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helpText?: string;
}

export function Input({
  label,
  error,
  helpText,
  id,
  className = '',
  ...props
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className={`form-field ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label htmlFor={inputId}>
          {label}
          {props.required && <span className="required">*</span>}
        </label>
      )}
      <input id={inputId} {...props} />
      {error && <span className="field-error">{error}</span>}
      {helpText && !error && <span className="help-text">{helpText}</span>}
    </div>
  );
}
