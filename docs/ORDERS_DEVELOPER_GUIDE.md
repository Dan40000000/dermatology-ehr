# Orders Module - Developer Quick Reference

## Component Architecture

### Component Hierarchy

```
OrdersPageEnhanced
├── QuickFilters
│   └── Modal dialogs (save/edit)
├── OrderFilters
│   ├── Search input
│   ├── Order Type checkboxes
│   ├── Status checkboxes
│   ├── Priority checkboxes
│   ├── Group By radio buttons
│   └── Clear Filters button
└── GroupedOrdersTable
    ├── Ungrouped Table (groupBy: 'none')
    │   └── OrderRow components
    └── Grouped Sections (groupBy: 'patient'|'provider')
        ├── Group Header (collapsible)
        └── OrderRow components
```

## Quick Integration Examples

### Example 1: Add Order Type Filter Component to Any Page

```tsx
import { useState } from 'react';
import { OrderFilters } from '../components/orders/OrderFilters';
import type { OrderType, OrderStatus, OrderPriority, OrderGroupBy } from '../types';

function MyComponent() {
  const [filters, setFilters] = useState({
    orderTypes: [] as OrderType[],
    statuses: [] as OrderStatus[],
    priorities: [] as OrderPriority[],
    searchTerm: '',
    groupBy: 'none' as OrderGroupBy,
  });

  return (
    <OrderFilters
      selectedOrderTypes={filters.orderTypes}
      selectedStatuses={filters.statuses}
      selectedPriorities={filters.priorities}
      searchTerm={filters.searchTerm}
      groupBy={filters.groupBy}
      onOrderTypesChange={(types) => setFilters(prev => ({ ...prev, orderTypes: types }))}
      onStatusesChange={(statuses) => setFilters(prev => ({ ...prev, statuses }))}
      onPrioritiesChange={(priorities) => setFilters(prev => ({ ...prev, priorities }))}
      onSearchChange={(search) => setFilters(prev => ({ ...prev, searchTerm: search }))}
      onGroupByChange={(groupBy) => setFilters(prev => ({ ...prev, groupBy }))}
      onClearFilters={() => setFilters({
        orderTypes: [],
        statuses: [],
        priorities: [],
        searchTerm: '',
        groupBy: 'none',
      })}
    />
  );
}
```

### Example 2: Implement Quick Filters in Another Module

```tsx
import { QuickFilters } from '../components/orders/QuickFilters';
import type { OrderFilters } from '../types';

function MyComponent() {
  const [currentFilters, setCurrentFilters] = useState<OrderFilters>({
    orderTypes: [],
    statuses: [],
    priorities: [],
    searchTerm: '',
    groupBy: 'none',
  });

  const handleLoadFilter = (loadedFilters: OrderFilters) => {
    setCurrentFilters(loadedFilters);
    // Apply filters to your data
  };

  return (
    <QuickFilters
      onLoadFilter={handleLoadFilter}
      currentFilters={currentFilters}
    />
  );
}
```

### Example 3: Custom Filter Logic

```tsx
import type { Order, OrderFilters } from '../types';

function filterOrders(orders: Order[], filters: OrderFilters): Order[] {
  return orders.filter(order => {
    // Order types filter
    if (filters.orderTypes.length > 0 && !filters.orderTypes.includes(order.type as OrderType)) {
      return false;
    }

    // Status filter
    if (filters.statuses.length > 0 && !filters.statuses.includes(order.status)) {
      return false;
    }

    // Priority filter
    if (filters.priorities.length > 0) {
      const orderPriority = order.priority || 'normal';
      if (!filters.priorities.includes(orderPriority)) {
        return false;
      }
    }

    // Search filter
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      const matchesDetails = order.details?.toLowerCase().includes(searchLower);
      const matchesNotes = order.notes?.toLowerCase().includes(searchLower);
      if (!matchesDetails && !matchesNotes) {
        return false;
      }
    }

    return true;
  });
}
```

### Example 4: Backend API Call with Filters

```tsx
import type { OrderFilters } from '../types';

async function fetchFilteredOrders(
  tenantId: string,
  token: string,
  filters: OrderFilters
) {
  const params = new URLSearchParams();

  // Add order types
  if (filters.orderTypes.length > 0) {
    params.append('orderTypes', filters.orderTypes.join(','));
  }

  // Add statuses
  if (filters.statuses.length > 0) {
    params.append('statuses', filters.statuses.join(','));
  }

  // Add priorities
  if (filters.priorities.length > 0) {
    params.append('priorities', filters.priorities.join(','));
  }

  // Add search
  if (filters.searchTerm) {
    params.append('search', filters.searchTerm);
  }

  const response = await fetch(
    `/api/orders?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-ID': tenantId,
      },
    }
  );

  return response.json();
}
```

## Common Tasks

### Add a New Order Type

1. **Update TypeScript type**:
```tsx
// frontend/src/types/index.ts
export type OrderType =
  | 'followup'
  | 'infusion'
  | 'injection'
  | 'lab'
  | 'pathology'
  | 'radiology'
  | 'referral'
  | 'surgery'
  | 'your-new-type'; // Add here
```

2. **Update filter component**:
```tsx
// frontend/src/components/orders/OrderFilters.tsx
const ORDER_TYPES: { value: OrderType; label: string }[] = [
  // ... existing types
  { value: 'your-new-type', label: 'Your New Type' },
];
```

3. **Update display labels**:
```tsx
// frontend/src/components/orders/GroupedOrdersTable.tsx
const getOrderTypeLabel = (type: string) => {
  const typeMap: Record<string, string> = {
    // ... existing mappings
    'your-new-type': 'Your New Type',
  };
  return typeMap[type] || type;
};
```

### Add a New Status

1. **Update TypeScript type**:
```tsx
// frontend/src/types/index.ts
export type OrderStatus =
  | 'open'
  | 'sent'
  | 'in-progress'
  | 'closed'
  | 'canceled'
  | 'your-new-status'; // Add here
```

2. **Update filter component**:
```tsx
// frontend/src/components/orders/OrderFilters.tsx
const ORDER_STATUSES: { value: OrderStatus; label: string }[] = [
  // ... existing statuses
  { value: 'your-new-status', label: 'Your New Status' },
];
```

### Customize Priority Colors

```tsx
// frontend/src/components/orders/OrderFilters.tsx
const ORDER_PRIORITIES: { value: OrderPriority; label: string; color: string }[] = [
  { value: 'normal', label: 'Normal', color: '#6b7280' },
  { value: 'high', label: 'High', color: '#f59e0b' },
  { value: 'stat', label: 'STAT', color: '#dc2626' },
];

// frontend/src/components/orders/GroupedOrdersTable.tsx
const getPriorityStyle = (priority?: string) => {
  switch (priority) {
    case 'stat':
      return { background: '#dc2626', color: '#ffffff' };
    case 'urgent':
    case 'high':
      return { background: '#f59e0b', color: '#ffffff' };
    default:
      return { background: '#e5e7eb', color: '#374151' };
  }
};
```

### Change localStorage Key

```tsx
// frontend/src/components/orders/QuickFilters.tsx
const STORAGE_KEY = 'your_custom_key'; // Change this line
```

### Add Custom Grouping Option

1. **Update TypeScript type**:
```tsx
// frontend/src/types/index.ts
export type OrderGroupBy = 'none' | 'patient' | 'provider' | 'your-group';
```

2. **Update filter component**:
```tsx
// frontend/src/components/orders/OrderFilters.tsx
const GROUP_BY_OPTIONS: { value: OrderGroupBy; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'patient', label: 'Patient' },
  { value: 'provider', label: 'Provider' },
  { value: 'your-group', label: 'Your Group' },
];
```

3. **Update grouping logic**:
```tsx
// frontend/src/components/orders/GroupedOrdersTable.tsx
const getOrderGroups = (): OrderGroup[] => {
  // ... existing code
  orders.forEach((order) => {
    let groupKey: string;
    if (groupBy === 'patient') {
      groupKey = order.patientId;
    } else if (groupBy === 'provider') {
      groupKey = order.providerId;
    } else if (groupBy === 'your-group') {
      groupKey = order.yourField; // Add your logic
    } else {
      groupKey = 'all';
    }
    // ... rest of logic
  });
};
```

## Styling Customization

### Override Component Styles

```tsx
// Create a custom styled version
import { OrderFilters } from '../components/orders/OrderFilters';

function StyledOrderFilters(props) {
  return (
    <div style={{ /* your custom styles */ }}>
      <OrderFilters {...props} />
    </div>
  );
}
```

### Customize Group Headers

```tsx
// In GroupedOrdersTable.tsx, modify this section:
<div
  onClick={() => toggleGroup(group.key)}
  style={{
    padding: '1rem',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', // Change gradient
    color: '#fff',
    // ... other styles
  }}
>
```

### Customize Priority Badges

```tsx
// In GroupedOrdersTable.tsx, modify getPriorityStyle:
const getPriorityStyle = (priority?: string) => {
  // Return your custom colors and styles
  return {
    background: yourBackgroundColor,
    color: yourTextColor,
    borderRadius: '4px',
    // ... additional styles
  };
};
```

## Testing

### Unit Test Template

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { YourComponent } from '../YourComponent';

describe('YourComponent', () => {
  it('renders correctly', () => {
    render(<YourComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('handles user interaction', () => {
    const mockHandler = vi.fn();
    render(<YourComponent onAction={mockHandler} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockHandler).toHaveBeenCalled();
  });
});
```

### Integration Test Template

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { YourPage } from '../YourPage';
import * as api from '../../api';

vi.mock('../../api');

describe('YourPage Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.fetchData as any).mockResolvedValue({ data: [] });
  });

  it('loads and displays data', async () => {
    render(<YourPage />);

    await waitFor(() => {
      expect(screen.getByText('Expected Data')).toBeInTheDocument();
    });
  });
});
```

## Performance Tips

### Optimize Large Lists

```tsx
// Use React.memo for row components
const OrderRow = React.memo(({ order, ...props }) => {
  // Component implementation
});

// Use useCallback for handlers
const handleClick = useCallback((orderId) => {
  // Handler implementation
}, [dependencies]);
```

### Debounce Search Input

```tsx
import { useState, useCallback } from 'react';
import { debounce } from 'lodash';

function SearchComponent() {
  const [searchTerm, setSearchTerm] = useState('');

  const debouncedSearch = useCallback(
    debounce((value) => {
      // Perform search
    }, 300),
    []
  );

  const handleChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    debouncedSearch(value);
  };

  return <input value={searchTerm} onChange={handleChange} />;
}
```

### Lazy Load Groups

```tsx
// Only render expanded groups
{!isCollapsed && (
  <LazyLoadComponent>
    {/* Expensive content */}
  </LazyLoadComponent>
)}
```

## Common Pitfalls

### 1. Filter State Management

❌ **Wrong**:
```tsx
// Mutating state directly
filters.orderTypes.push('lab');
```

✅ **Correct**:
```tsx
// Creating new state
setFilters(prev => ({
  ...prev,
  orderTypes: [...prev.orderTypes, 'lab']
}));
```

### 2. localStorage JSON Parsing

❌ **Wrong**:
```tsx
const data = localStorage.getItem('key');
return data.filters; // Will fail if data is string
```

✅ **Correct**:
```tsx
const data = localStorage.getItem('key');
if (data) {
  try {
    const parsed = JSON.parse(data);
    return parsed.filters;
  } catch (error) {
    console.error('Failed to parse:', error);
    return [];
  }
}
```

### 3. Type Assertions

❌ **Wrong**:
```tsx
const type = order.type; // string
filters.orderTypes.includes(type); // Type error
```

✅ **Correct**:
```tsx
const type = order.type as OrderType;
filters.orderTypes.includes(type);
```

## Debugging

### Enable Debug Logging

```tsx
// Add at component level
useEffect(() => {
  console.log('Current filters:', filters);
  console.log('Filtered orders count:', filteredOrders.length);
}, [filters, filteredOrders]);
```

### Check localStorage

```tsx
// In browser console
localStorage.getItem('orders_quick_filters');

// Clear localStorage
localStorage.removeItem('orders_quick_filters');
```

### Inspect API Calls

```tsx
// Add logging to API calls
console.log('Fetching with params:', {
  orderTypes,
  statuses,
  priorities,
  search,
});
```

## Resources

- **Main Documentation**: `/docs/ORDERS_MODULE_ENHANCEMENTS.md`
- **Implementation Summary**: `/ORDERS_IMPLEMENTATION_SUMMARY.md`
- **Test Files**: `frontend/src/components/orders/__tests__/`
- **TypeScript Types**: `frontend/src/types/index.ts`
- **Backend API**: `backend/src/routes/orders.ts`
- **Database Migration**: `backend/src/db/migrations/019_orders_enhancements.sql`

## Support

For issues or questions:
1. Check existing test files for usage examples
2. Review type definitions for available options
3. Consult main documentation
4. Contact development team
