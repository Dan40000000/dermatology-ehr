import { useState } from 'react';

interface DatePresetsProps {
  onDateRangeChange: (startDate: string, endDate: string) => void;
}

export function DatePresets({ onDateRangeChange }: DatePresetsProps) {
  const [activePreset, setActivePreset] = useState<string>('');
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const today = new Date();
  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  const handlePreset = (preset: string) => {
    setActivePreset(preset);
    setShowCustom(false);

    const end = formatDate(today);
    let start = '';

    switch (preset) {
      case 'today':
        start = end;
        break;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        start = formatDate(yesterday);
        onDateRangeChange(start, start);
        return;
      case 'last7':
        const last7 = new Date(today);
        last7.setDate(last7.getDate() - 7);
        start = formatDate(last7);
        break;
      case 'last30':
        const last30 = new Date(today);
        last30.setDate(last30.getDate() - 30);
        start = formatDate(last30);
        break;
      case 'thisMonth':
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        start = formatDate(firstDay);
        break;
      default:
        return;
    }

    onDateRangeChange(start, end);
  };

  const handleCustom = () => {
    setShowCustom(true);
    setActivePreset('custom');
  };

  const applyCustomRange = () => {
    if (customStart && customEnd) {
      onDateRangeChange(customStart, customEnd);
    }
  };

  return (
    <div className="date-presets" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={{ fontWeight: '600', color: '#4b5563' }}>Service Date:</label>
      <button
        type="button"
        className={`preset-btn ${activePreset === 'today' ? 'active' : ''}`}
        onClick={() => handlePreset('today')}
        style={{
          padding: '0.5rem 1rem',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          background: activePreset === 'today' ? '#059669' : 'white',
          color: activePreset === 'today' ? 'white' : '#374151',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: '500',
        }}
      >
        Current Day
      </button>
      <button
        type="button"
        className={`preset-btn ${activePreset === 'yesterday' ? 'active' : ''}`}
        onClick={() => handlePreset('yesterday')}
        style={{
          padding: '0.5rem 1rem',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          background: activePreset === 'yesterday' ? '#059669' : 'white',
          color: activePreset === 'yesterday' ? 'white' : '#374151',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: '500',
        }}
      >
        Yesterday
      </button>
      <button
        type="button"
        className={`preset-btn ${activePreset === 'last7' ? 'active' : ''}`}
        onClick={() => handlePreset('last7')}
        style={{
          padding: '0.5rem 1rem',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          background: activePreset === 'last7' ? '#059669' : 'white',
          color: activePreset === 'last7' ? 'white' : '#374151',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: '500',
        }}
      >
        Last 7 Days
      </button>
      <button
        type="button"
        className={`preset-btn ${activePreset === 'last30' ? 'active' : ''}`}
        onClick={() => handlePreset('last30')}
        style={{
          padding: '0.5rem 1rem',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          background: activePreset === 'last30' ? '#059669' : 'white',
          color: activePreset === 'last30' ? 'white' : '#374151',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: '500',
        }}
      >
        Last 30 Days
      </button>
      <button
        type="button"
        className={`preset-btn ${activePreset === 'thisMonth' ? 'active' : ''}`}
        onClick={() => handlePreset('thisMonth')}
        style={{
          padding: '0.5rem 1rem',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          background: activePreset === 'thisMonth' ? '#059669' : 'white',
          color: activePreset === 'thisMonth' ? 'white' : '#374151',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: '500',
        }}
      >
        This Month
      </button>
      <button
        type="button"
        className={`preset-btn ${activePreset === 'custom' ? 'active' : ''}`}
        onClick={handleCustom}
        style={{
          padding: '0.5rem 1rem',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          background: activePreset === 'custom' ? '#059669' : 'white',
          color: activePreset === 'custom' ? 'white' : '#374151',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: '500',
        }}
      >
        Custom Range
      </button>

      {showCustom && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            style={{
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
            }}
          />
          <span>to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            style={{
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
            }}
          />
          <button
            type="button"
            onClick={applyCustomRange}
            style={{
              padding: '0.5rem 1rem',
              background: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
            }}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
