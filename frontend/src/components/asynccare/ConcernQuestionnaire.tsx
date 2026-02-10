/**
 * ConcernQuestionnaire Component
 * Guided questions based on concern type
 */

import { useState, useEffect } from 'react';
import type { TemplateQuestion } from '../../api/asyncCare';

interface ConcernQuestionnaireProps {
  questions: TemplateQuestion[];
  responses: Record<string, any>;
  onChange: (responses: Record<string, any>) => void;
  disabled?: boolean;
}

export function ConcernQuestionnaire({
  questions,
  responses,
  onChange,
  disabled = false,
}: ConcernQuestionnaireProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateResponse = (questionId: string, value: any) => {
    onChange({
      ...responses,
      [questionId]: value,
    });

    // Clear error when user provides a value
    if (errors[questionId]) {
      setErrors((prev) => {
        const { [questionId]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const validateResponses = (): boolean => {
    const newErrors: Record<string, string> = {};

    questions.forEach((q) => {
      if (q.required && !responses[q.id]) {
        newErrors[q.id] = 'This field is required';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const renderQuestion = (question: TemplateQuestion) => {
    const value = responses[question.id];
    const hasError = !!errors[question.id];

    const inputStyle = {
      width: '100%',
      padding: '0.5rem',
      border: `1px solid ${hasError ? '#dc2626' : '#d1d5db'}`,
      borderRadius: '6px',
      fontSize: '1rem',
    };

    switch (question.type) {
      case 'text':
        return (
          <textarea
            value={value || ''}
            onChange={(e) => updateResponse(question.id, e.target.value)}
            placeholder="Type your answer..."
            rows={3}
            disabled={disabled}
            style={{
              ...inputStyle,
              resize: 'vertical',
            }}
          />
        );

      case 'select':
        return (
          <select
            value={value || ''}
            onChange={(e) => updateResponse(question.id, e.target.value)}
            disabled={disabled}
            style={inputStyle}
          >
            <option value="">Select an option...</option>
            {question.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );

      case 'multiselect':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {question.options?.map((opt) => {
              const selected = Array.isArray(value) && value.includes(opt);
              return (
                <label
                  key={opt}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem',
                    border: `1px solid ${selected ? '#3b82f6' : '#e5e7eb'}`,
                    borderRadius: '6px',
                    background: selected ? '#eff6ff' : '#fff',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {
                      const currentValue = Array.isArray(value) ? value : [];
                      const newValue = selected
                        ? currentValue.filter((v) => v !== opt)
                        : [...currentValue, opt];
                      updateResponse(question.id, newValue);
                    }}
                    disabled={disabled}
                  />
                  {opt}
                </label>
              );
            })}
          </div>
        );

      case 'boolean':
        return (
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              type="button"
              onClick={() => updateResponse(question.id, true)}
              disabled={disabled}
              style={{
                flex: 1,
                padding: '0.75rem',
                border: `2px solid ${value === true ? '#10b981' : '#e5e7eb'}`,
                borderRadius: '6px',
                background: value === true ? '#d1fae5' : '#fff',
                color: value === true ? '#065f46' : '#374151',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontWeight: 500,
              }}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => updateResponse(question.id, false)}
              disabled={disabled}
              style={{
                flex: 1,
                padding: '0.75rem',
                border: `2px solid ${value === false ? '#ef4444' : '#e5e7eb'}`,
                borderRadius: '6px',
                background: value === false ? '#fee2e2' : '#fff',
                color: value === false ? '#991b1b' : '#374151',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontWeight: 500,
              }}
            >
              No
            </button>
          </div>
        );

      case 'scale':
        const min = question.min ?? 0;
        const max = question.max ?? 10;
        const currentValue = typeof value === 'number' ? value : null;

        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                {question.minLabel || min}
              </span>
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                {question.maxLabel || max}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => updateResponse(question.id, num)}
                  disabled={disabled}
                  style={{
                    flex: 1,
                    padding: '0.75rem 0.25rem',
                    border: `2px solid ${currentValue === num ? '#3b82f6' : '#e5e7eb'}`,
                    borderRadius: '6px',
                    background: currentValue === num ? '#3b82f6' : '#fff',
                    color: currentValue === num ? '#fff' : '#374151',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontWeight: 500,
                    fontSize: '0.875rem',
                  }}
                >
                  {num}
                </button>
              ))}
            </div>
            {currentValue !== null && (
              <div
                style={{
                  textAlign: 'center',
                  marginTop: '0.5rem',
                  fontSize: '0.875rem',
                  color: '#6b7280',
                }}
              >
                Selected: <strong>{currentValue}</strong>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  if (questions.length === 0) {
    return (
      <div
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#6b7280',
          background: '#f9fafb',
          borderRadius: '8px',
        }}
      >
        No questions for this concern type
      </div>
    );
  }

  return (
    <div className="concern-questionnaire">
      {questions.map((question, index) => (
        <div
          key={question.id}
          style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
          }}
        >
          <label
            style={{
              display: 'block',
              marginBottom: '0.75rem',
              fontWeight: 500,
              color: '#1f2937',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: '#e5e7eb',
                marginRight: '0.5rem',
                fontSize: '0.75rem',
              }}
            >
              {index + 1}
            </span>
            {question.question}
            {question.required && <span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>}
          </label>

          {renderQuestion(question)}

          {errors[question.id] && (
            <div
              style={{
                marginTop: '0.5rem',
                fontSize: '0.875rem',
                color: '#dc2626',
              }}
            >
              {errors[question.id]}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
