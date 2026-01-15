import type { OrderType, OrderStatus, OrderPriority, OrderGroupBy } from '../../types';

interface OrderFiltersProps {
  selectedOrderTypes: OrderType[];
  selectedStatuses: OrderStatus[];
  selectedPriorities: OrderPriority[];
  searchTerm: string;
  groupBy: OrderGroupBy;
  onOrderTypesChange: (types: OrderType[]) => void;
  onStatusesChange: (statuses: OrderStatus[]) => void;
  onPrioritiesChange: (priorities: OrderPriority[]) => void;
  onSearchChange: (search: string) => void;
  onGroupByChange: (groupBy: OrderGroupBy) => void;
  onClearFilters: () => void;
}

const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: 'followup', label: 'Follow Up' },
  { value: 'infusion', label: 'Infusion' },
  { value: 'injection', label: 'Injection' },
  { value: 'lab', label: 'Labs' },
  { value: 'pathology', label: 'Pathology' },
  { value: 'radiology', label: 'Radiology' },
  { value: 'referral', label: 'Referral' },
  { value: 'surgery', label: 'Surgery' },
];

const ORDER_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'sent', label: 'Sent' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'closed', label: 'Closed' },
  { value: 'canceled', label: 'Canceled' },
];

const ORDER_PRIORITIES: { value: OrderPriority; label: string; color: string }[] = [
  { value: 'normal', label: 'Normal', color: '#6b7280' },
  { value: 'high', label: 'High', color: '#f59e0b' },
  { value: 'stat', label: 'STAT', color: '#dc2626' },
];

const GROUP_BY_OPTIONS: { value: OrderGroupBy; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'patient', label: 'Patient' },
  { value: 'provider', label: 'Provider' },
];

export function OrderFilters({
  selectedOrderTypes,
  selectedStatuses,
  selectedPriorities,
  searchTerm,
  groupBy,
  onOrderTypesChange,
  onStatusesChange,
  onPrioritiesChange,
  onSearchChange,
  onGroupByChange,
  onClearFilters,
}: OrderFiltersProps) {
  const toggleOrderType = (type: OrderType) => {
    if (selectedOrderTypes.includes(type)) {
      onOrderTypesChange(selectedOrderTypes.filter((t) => t !== type));
    } else {
      onOrderTypesChange([...selectedOrderTypes, type]);
    }
  };

  const toggleAllOrderTypes = () => {
    if (selectedOrderTypes.length === ORDER_TYPES.length) {
      onOrderTypesChange([]);
    } else {
      onOrderTypesChange(ORDER_TYPES.map((t) => t.value));
    }
  };

  const toggleStatus = (status: OrderStatus) => {
    if (selectedStatuses.includes(status)) {
      onStatusesChange(selectedStatuses.filter((s) => s !== status));
    } else {
      onStatusesChange([...selectedStatuses, status]);
    }
  };

  const toggleAllStatuses = () => {
    if (selectedStatuses.length === ORDER_STATUSES.length) {
      onStatusesChange([]);
    } else {
      onStatusesChange(ORDER_STATUSES.map((s) => s.value));
    }
  };

  const togglePriority = (priority: OrderPriority) => {
    if (selectedPriorities.includes(priority)) {
      onPrioritiesChange(selectedPriorities.filter((p) => p !== priority));
    } else {
      onPrioritiesChange([...selectedPriorities, priority]);
    }
  };

  const toggleAllPriorities = () => {
    if (selectedPriorities.length === ORDER_PRIORITIES.length) {
      onPrioritiesChange([]);
    } else {
      onPrioritiesChange(ORDER_PRIORITIES.map((p) => p.value));
    }
  };

  return (
    <div
      className="ema-filter-panel"
      style={{
        background: '#fff',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1rem',
        border: '1px solid #e5e7eb',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
        {/* Search */}
        <div className="ema-filter-group">
          <label className="ema-filter-label" style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>
            Search
          </label>
          <input
            type="text"
            className="ema-filter-input"
            placeholder="Search orders..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
            }}
          />
        </div>

        {/* Order Types */}
        <div className="ema-filter-group">
          <label className="ema-filter-label" style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>
            Order Type
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selectedOrderTypes.length === ORDER_TYPES.length}
                onChange={toggleAllOrderTypes}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.813rem', fontWeight: 600 }}>Select All</span>
            </label>
            {ORDER_TYPES.map((type) => (
              <label key={type.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedOrderTypes.includes(type.value)}
                  onChange={() => toggleOrderType(type.value)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.813rem' }}>{type.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Status */}
        <div className="ema-filter-group">
          <label className="ema-filter-label" style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>
            Status
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selectedStatuses.length === ORDER_STATUSES.length}
                onChange={toggleAllStatuses}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.813rem', fontWeight: 600 }}>Select All</span>
            </label>
            {ORDER_STATUSES.map((status) => (
              <label key={status.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes(status.value)}
                  onChange={() => toggleStatus(status.value)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.813rem' }}>{status.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div className="ema-filter-group">
          <label className="ema-filter-label" style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>
            Priority
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selectedPriorities.length === ORDER_PRIORITIES.length}
                onChange={toggleAllPriorities}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.813rem', fontWeight: 600 }}>Select All</span>
            </label>
            {ORDER_PRIORITIES.map((priority) => (
              <label key={priority.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedPriorities.includes(priority.value)}
                  onChange={() => togglePriority(priority.value)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.813rem', color: priority.color, fontWeight: 600 }}>{priority.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Group By */}
        <div className="ema-filter-group">
          <label className="ema-filter-label" style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>
            Group By
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {GROUP_BY_OPTIONS.map((option) => (
              <label key={option.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="groupBy"
                  checked={groupBy === option.value}
                  onChange={() => onGroupByChange(option.value)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.813rem' }}>{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Clear Filters */}
        <div className="ema-filter-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button
            type="button"
            className="ema-filter-btn secondary"
            onClick={onClearFilters}
            style={{
              padding: '0.5rem 1rem',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            Clear All Filters
          </button>
        </div>
      </div>
    </div>
  );
}
