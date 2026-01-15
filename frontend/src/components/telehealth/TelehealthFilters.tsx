import React from 'react';

export interface FilterValues {
  datePreset: string;
  startDate: string;
  endDate: string;
  status: string;
  assignedTo: string;
  physician: string;
  reason: string;
  myUnreadOnly: boolean;
}

interface TelehealthFiltersProps {
  filters: FilterValues;
  onChange: (filters: FilterValues) => void;
  providers: Array<{ id: number; fullName?: string; name?: string }>;
}

export const DERMATOLOGY_REASONS = [
  'Acne',
  'Birthmark',
  'Bleeding Lesion',
  'Blisters',
  'Changing Mole',
  'Cosmetic Consultation',
  'Cyst',
  'Discoloration',
  'Eczema',
  'Hair Loss',
  'Laceration',
  'Melasma',
  'Psoriasis',
  'Rash',
  'Rosacea',
  'Scar',
  'Skin Irritation',
  'Skin Lesion',
  'Sunburn',
  'Warts',
  'Wound',
  'Wound Check',
];

export const DATE_PRESETS = [
  { value: 'today', label: 'Current Day' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7days', label: 'Last 7 Days' },
  { value: 'last31days', label: 'Last 31 Days' },
  { value: 'alltime', label: 'All Time' },
  { value: 'custom', label: 'Custom Range' },
];

const TelehealthFilters: React.FC<TelehealthFiltersProps> = ({ filters, onChange, providers }) => {
  const handleDatePresetChange = (preset: string) => {
    const today = new Date();
    let startDate = '';
    let endDate = '';

    if (preset === 'custom') {
      // Keep existing custom dates
      return onChange({ ...filters, datePreset: preset });
    }

    switch (preset) {
      case 'today':
        const todayStr = today.toISOString().split('T')[0];
        startDate = todayStr;
        endDate = todayStr;
        break;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        startDate = yesterdayStr;
        endDate = yesterdayStr;
        break;
      case 'last7days':
        const last7 = new Date(today);
        last7.setDate(last7.getDate() - 7);
        startDate = last7.toISOString().split('T')[0];
        endDate = today.toISOString().split('T')[0];
        break;
      case 'last31days':
        const last31 = new Date(today);
        last31.setDate(last31.getDate() - 31);
        startDate = last31.toISOString().split('T')[0];
        endDate = today.toISOString().split('T')[0];
        break;
      case 'alltime':
        // Clear dates
        startDate = '';
        endDate = '';
        break;
    }

    onChange({ ...filters, datePreset: preset, startDate, endDate });
  };

  const handleChange = (field: keyof FilterValues, value: string | boolean) => {
    onChange({ ...filters, [field]: value });
  };

  return (
    <div className="telehealth-filters">
      <div className="filters-row">
        <div className="filter-group">
          <label htmlFor="datePreset">Date Range</label>
          <select
            id="datePreset"
            value={filters.datePreset}
            onChange={(e) => handleDatePresetChange(e.target.value)}
          >
            {DATE_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        {filters.datePreset === 'custom' && (
          <>
            <div className="filter-group">
              <label htmlFor="startDate">Start Date</label>
              <input
                id="startDate"
                type="date"
                value={filters.startDate}
                onChange={(e) => handleChange('startDate', e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label htmlFor="endDate">End Date</label>
              <input
                id="endDate"
                type="date"
                value={filters.endDate}
                onChange={(e) => handleChange('endDate', e.target.value)}
              />
            </div>
          </>
        )}

        <div className="filter-group">
          <label htmlFor="status">Status</label>
          <select
            id="status"
            value={filters.status}
            onChange={(e) => handleChange('status', e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="scheduled">New Visit</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="reason">Reason for Visit</label>
          <select
            id="reason"
            value={filters.reason}
            onChange={(e) => handleChange('reason', e.target.value)}
          >
            <option value="">All Reasons</option>
            {DERMATOLOGY_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="assignedTo">Assigned To</label>
          <select
            id="assignedTo"
            value={filters.assignedTo}
            onChange={(e) => handleChange('assignedTo', e.target.value)}
          >
            <option value="">All Staff</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.fullName || provider.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="physician">Physician</label>
          <select
            id="physician"
            value={filters.physician}
            onChange={(e) => handleChange('physician', e.target.value)}
          >
            <option value="">All Physicians</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.fullName || provider.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={filters.myUnreadOnly}
              onChange={(e) => handleChange('myUnreadOnly', e.target.checked)}
            />
            <span>My Unread Only</span>
          </label>
        </div>
      </div>

      <style>{`
        .telehealth-filters {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .filters-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          align-items: end;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .filter-group label {
          font-weight: 500;
          font-size: 0.875rem;
          color: #374151;
        }

        .filter-group select,
        .filter-group input[type="date"] {
          padding: 0.625rem;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 0.875rem;
          background: white;
          transition: border-color 0.2s;
        }

        .filter-group select:focus,
        .filter-group input[type="date"]:focus {
          outline: none;
          border-color: #059669;
          box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.1);
        }

        .checkbox-group {
          display: flex;
          align-items: center;
          padding-top: 0.25rem;
        }

        .checkbox-group label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          font-weight: 400;
        }

        .checkbox-group input[type="checkbox"] {
          width: 1.125rem;
          height: 1.125rem;
          cursor: pointer;
          accent-color: #059669;
        }
      `}</style>
    </div>
  );
};

export default TelehealthFilters;
