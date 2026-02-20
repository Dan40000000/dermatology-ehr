import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import type { Provider } from '../../types';

interface TimeBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: TimeBlockFormData) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  providers: Provider[];
  timeBlock?: TimeBlock | null;
  initialData?: {
    providerId?: string;
    date?: string;
    startTime?: string;
  };
}

export interface TimeBlockFormData {
  providerId: string;
  title: string;
  blockType: 'blocked' | 'lunch' | 'meeting' | 'admin' | 'continuing_education' | 'out_of_office';
  description?: string;
  date: string;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
  recurrencePattern?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  recurrenceEndDate?: string;
}

interface RecurrencePatternObject {
  pattern: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  days?: number[];
  dayOfMonth?: number;
  until?: string;
}

interface TimeBlock {
  id: string;
  providerId: string;
  title: string;
  blockType: string;
  description?: string;
  startTime: string;
  endTime: string;
  isRecurring?: boolean;
  recurrencePattern?: 'daily' | 'weekly' | 'biweekly' | 'monthly' | RecurrencePatternObject;
  recurrenceEndDate?: string;
}

export function TimeBlockModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  providers,
  timeBlock,
  initialData,
}: TimeBlockModalProps) {
  const [formData, setFormData] = useState<TimeBlockFormData>({
    providerId: '',
    title: '',
    blockType: 'blocked',
    description: '',
    date: '',
    startTime: '09:00',
    endTime: '10:00',
    isRecurring: false,
    recurrencePattern: 'weekly',
    recurrenceEndDate: '',
  });

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form data when modal opens
  useEffect(() => {
    if (isOpen) {
      if (timeBlock) {
        // Edit mode
        const startDate = new Date(timeBlock.startTime);
        const endDate = new Date(timeBlock.endTime);
        const recurrencePattern =
          typeof timeBlock.recurrencePattern === 'string'
            ? timeBlock.recurrencePattern
            : timeBlock.recurrencePattern?.pattern;
        const recurrenceEndDate =
          timeBlock.recurrenceEndDate ||
          (typeof timeBlock.recurrencePattern === 'object'
            ? timeBlock.recurrencePattern.until || ''
            : '');

        setFormData({
          providerId: timeBlock.providerId,
          title: timeBlock.title,
          blockType: timeBlock.blockType as TimeBlockFormData['blockType'],
          description: timeBlock.description || '',
          date: startDate.toISOString().split('T')[0],
          startTime: `${startDate.getHours().toString().padStart(2, '0')}:${startDate
            .getMinutes()
            .toString()
            .padStart(2, '0')}`,
          endTime: `${endDate.getHours().toString().padStart(2, '0')}:${endDate
            .getMinutes()
            .toString()
            .padStart(2, '0')}`,
          isRecurring: timeBlock.isRecurring || false,
          recurrencePattern: recurrencePattern || 'weekly',
          recurrenceEndDate,
        });
      } else if (initialData) {
        // Create mode with initial data
        setFormData((prev) => ({
          ...prev,
          providerId: initialData.providerId || prev.providerId,
          date: initialData.date || prev.date,
          startTime: initialData.startTime || prev.startTime,
        }));
      } else {
        // Create mode from scratch
        setFormData({
          providerId: providers[0]?.id || '',
          title: '',
          blockType: 'blocked',
          description: '',
          date: new Date().toISOString().split('T')[0],
          startTime: '09:00',
          endTime: '10:00',
          isRecurring: false,
          recurrencePattern: 'weekly',
          recurrenceEndDate: '',
        });
      }
      setErrors({});
    }
  }, [isOpen, timeBlock, initialData, providers]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.providerId) newErrors.providerId = 'Provider is required';
    if (!formData.title) newErrors.title = 'Title is required';
    if (!formData.date) newErrors.date = 'Date is required';
    if (!formData.startTime) newErrors.startTime = 'Start time is required';
    if (!formData.endTime) newErrors.endTime = 'End time is required';

    // Validate time range
    if (formData.startTime && formData.endTime) {
      const [startHour, startMin] = formData.startTime.split(':').map(Number);
      const [endHour, endMin] = formData.endTime.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (endMinutes <= startMinutes) {
        newErrors.endTime = 'End time must be after start time';
      }
    }

    // Validate recurrence end date
    if (formData.isRecurring && formData.recurrenceEndDate) {
      const blockDate = new Date(formData.date);
      const endDate = new Date(formData.recurrenceEndDate);
      if (endDate <= blockDate) {
        newErrors.recurrenceEndDate = 'Recurrence end date must be after the start date';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Failed to save time block:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!timeBlock || !onDelete) return;
    if (!window.confirm('Are you sure you want to delete this time block?')) return;

    setDeleting(true);
    try {
      await onDelete(timeBlock.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete time block:', error);
    } finally {
      setDeleting(false);
    }
  };

  const handleChange = (field: keyof TimeBlockFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Generate time options (5-minute intervals from 6am to 6pm)
  const timeOptions = [];
  for (let hour = 6; hour < 19; hour++) {
    for (let minute = 0; minute < 60; minute += 5) {
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      const displayStr = `${hour % 12 || 12}:${minute.toString().padStart(2, '0')} ${
        hour < 12 ? 'AM' : 'PM'
      }`;
      timeOptions.push({ value: timeStr, label: displayStr });
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={timeBlock ? 'Edit Time Block' : 'Create Time Block'}
      size="lg"
    >
      <div className="modal-form">
        {/* Provider Selection */}
        <div className="form-field">
          <label htmlFor="provider">
            Provider <span className="required">*</span>
          </label>
          <select
            id="provider"
            value={formData.providerId}
            onChange={(e) => handleChange('providerId', e.target.value)}
            disabled={!!timeBlock}
            className={errors.providerId ? 'error' : ''}
          >
            <option value="">Select provider...</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName} {p.specialty ? `- ${p.specialty}` : ''}
              </option>
            ))}
          </select>
          {errors.providerId && <span className="field-error">{errors.providerId}</span>}
        </div>

        <div className="form-row">
          {/* Block Type Selection */}
          <div className="form-field">
            <label htmlFor="blockType">
              Block Type <span className="required">*</span>
            </label>
            <select
              id="blockType"
              value={formData.blockType}
              onChange={(e) => handleChange('blockType', e.target.value)}
              className={errors.blockType ? 'error' : ''}
            >
              <option value="blocked">Blocked</option>
              <option value="lunch">Lunch Break</option>
              <option value="meeting">Meeting</option>
              <option value="admin">Admin Time</option>
              <option value="continuing_education">Continuing Education</option>
              <option value="out_of_office">Out of Office</option>
            </select>
            {errors.blockType && <span className="field-error">{errors.blockType}</span>}
          </div>

          {/* Title */}
          <div className="form-field">
            <label htmlFor="title">
              Title <span className="required">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="e.g., Lunch Break, Staff Meeting"
              className={errors.title ? 'error' : ''}
            />
            {errors.title && <span className="field-error">{errors.title}</span>}
          </div>
        </div>

        {/* Description */}
        <div className="form-field">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Optional notes..."
            rows={2}
          />
        </div>

        <div className="form-row">
          {/* Date Selection */}
          <div className="form-field">
            <label htmlFor="date">
              Date <span className="required">*</span>
            </label>
            <input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => handleChange('date', e.target.value)}
              className={errors.date ? 'error' : ''}
            />
            {errors.date && <span className="field-error">{errors.date}</span>}
          </div>

          {/* Start Time Selection */}
          <div className="form-field">
            <label htmlFor="startTime">
              Start Time <span className="required">*</span>
            </label>
            <select
              id="startTime"
              value={formData.startTime}
              onChange={(e) => handleChange('startTime', e.target.value)}
              className={errors.startTime ? 'error' : ''}
            >
              {timeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.startTime && <span className="field-error">{errors.startTime}</span>}
          </div>

          {/* End Time Selection */}
          <div className="form-field">
            <label htmlFor="endTime">
              End Time <span className="required">*</span>
            </label>
            <select
              id="endTime"
              value={formData.endTime}
              onChange={(e) => handleChange('endTime', e.target.value)}
              className={errors.endTime ? 'error' : ''}
            >
              {timeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.endTime && <span className="field-error">{errors.endTime}</span>}
          </div>
        </div>

        {/* Recurring Checkbox */}
        <div className="form-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={formData.isRecurring}
              onChange={(e) => handleChange('isRecurring', e.target.checked)}
            />
            Recurring Time Block
          </label>
        </div>

        {/* Recurrence Options */}
        {formData.isRecurring && (
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="recurrencePattern">Recurrence Pattern</label>
              <select
                id="recurrencePattern"
                value={formData.recurrencePattern}
                onChange={(e) => handleChange('recurrencePattern', e.target.value)}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="recurrenceEndDate">End Date (Optional)</label>
              <input
                id="recurrenceEndDate"
                type="date"
                value={formData.recurrenceEndDate}
                onChange={(e) => handleChange('recurrenceEndDate', e.target.value)}
                className={errors.recurrenceEndDate ? 'error' : ''}
              />
              {errors.recurrenceEndDate && (
                <span className="field-error">{errors.recurrenceEndDate}</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="modal-footer">
        {timeBlock && onDelete && (
          <button
            type="button"
            className="btn-secondary"
            onClick={handleDelete}
            disabled={saving || deleting}
            style={{ marginRight: 'auto', color: 'var(--error-600)' }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={onClose} disabled={saving || deleting}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={handleSubmit} disabled={saving || deleting}>
          {saving ? 'Saving...' : timeBlock ? 'Update Time Block' : 'Create Time Block'}
        </button>
      </div>
    </Modal>
  );
}
