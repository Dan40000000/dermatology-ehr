import React from 'react';

export interface FilterValues {
  datePreset: string;
  startDate: string;
  endDate: string;
  status: string;
  assignedTo: string;
  physician: string;
  patientSearch: string;
  reason: string;
  myUnreadOnly: boolean;
}

interface TelehealthFiltersProps {
  filters: FilterValues;
  onChange: (filters: FilterValues) => void;
  onClear: () => void;
  providers: Array<{ id: number; fullName?: string; name?: string }>;
  patients: Array<{ id: number; firstName: string; lastName: string }>;
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

const TelehealthFilters: React.FC<TelehealthFiltersProps> = ({ filters, onChange, onClear, providers, patients }) => {
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
      <h3 className="filters-title">Filter Telehealth Cases</h3>

      <div className="filters-row">
        <div className="filter-group">
          <label htmlFor="datePreset">Dates</label>
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
              <label htmlFor="startDate">Date Created (From)</label>
              <input
                id="startDate"
                type="date"
                value={filters.startDate}
                onChange={(e) => handleChange('startDate', e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label htmlFor="endDate">Date Created (To)</label>
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
            <option value="">Any</option>
            <option value="scheduled">New Visit</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
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

        <div className="filter-group">
          <label htmlFor="patientSearch">Patient</label>
          <select
            id="patientSearch"
            value={filters.patientSearch}
            onChange={(e) => handleChange('patientSearch', e.target.value)}
          >
            <option value="">All Patients</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.firstName} {patient.lastName}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="reason">Reason</label>
          <select
            id="reason"
            value={filters.reason}
            onChange={(e) => handleChange('reason', e.target.value)}
          >
            <option value="">Any</option>
            {DERMATOLOGY_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="myUnreadOnly">My Unread Only</label>
          <select
            id="myUnreadOnly"
            value={filters.myUnreadOnly ? 'yes' : 'no'}
            onChange={(e) => handleChange('myUnreadOnly', e.target.value === 'yes')}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
      </div>

      <div className="filters-actions">
        <button className="filter-btn apply-btn" onClick={() => onChange(filters)}>
          Apply Filters
        </button>
        <button className="filter-btn clear-btn" onClick={onClear}>
          Clear Filters
        </button>
      </div>

      <style>{`
        .telehealth-filters {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .filters-title {
          margin: 0 0 1.25rem 0;
          font-size: 1rem;
          font-weight: 600;
          color: #0e7490;
          padding-bottom: 0.75rem;
          border-bottom: 2px solid #e0f2fe;
        }

        .filters-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1rem;
          margin-bottom: 1.25rem;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .filter-group label {
          font-weight: 500;
          font-size: 0.875rem;
          color: #475569;
        }

        .filter-group select,
        .filter-group input[type="date"] {
          padding: 0.625rem;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 0.875rem;
          background: white;
          transition: all 0.2s;
          cursor: pointer;
        }

        .filter-group select:hover,
        .filter-group input[type="date"]:hover {
          border-color: #0891b2;
        }

        .filter-group select:focus,
        .filter-group input[type="date"]:focus {
          outline: none;
          border-color: #0891b2;
          box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.1);
        }

        .filters-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
          padding-top: 1rem;
          border-top: 1px solid #e2e8f0;
        }

        .filter-btn {
          padding: 0.625rem 1.5rem;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .apply-btn {
          background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
          color: white;
        }

        .apply-btn:hover {
          background: linear-gradient(135deg, #0891b2 0%, #0e7490 100%);
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(8, 145, 178, 0.2);
        }

        .clear-btn {
          background: white;
          color: #64748b;
          border: 1px solid #cbd5e1;
        }

        .clear-btn:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }
      `}</style>
    </div>
  );
};

export default TelehealthFilters;
