# Export Functionality - Quick Reference

## Quick Start

### 1. Import Required Modules

```typescript
import { ExportButtons } from '../components/ui';
import type { ExportColumn } from '../utils/export';
import { formatDate, formatCurrency, formatPhone } from '../utils/export';
```

### 2. Define Export Columns

```typescript
const exportColumns: ExportColumn[] = [
  { key: 'fieldName', label: 'Column Header' },
  { key: 'dateField', label: 'Date', format: (date) => formatDate(date, 'short') },
  { key: 'priceField', label: 'Price', format: formatCurrency },
  { key: 'phoneField', label: 'Phone', format: formatPhone },
];
```

### 3. Add Export Button

```typescript
<ExportButtons
  data={yourDataArray}
  filename="ReportName"
  columns={exportColumns}
  variant="dropdown"
  pdfOptions={{ title: 'Report Title', orientation: 'landscape' }}
  onExport={(type) => console.log(`Exported as ${type}`)}
/>
```

## Format Options

### Date Formats
```typescript
formatDate(date, 'short')    // 12/08/2025
formatDate(date, 'long')     // December 8, 2025
formatDate(date, 'datetime') // 12/08/2025, 2:30 PM
formatDate(date, 'time')     // 2:30 PM
```

### Currency Format
```typescript
formatCurrency(1234)      // $12.34 (if value is in cents)
formatCurrency(123456)    // $1,234.56 (if value is in cents)
formatCurrency(12.34)     // $12.34 (if value is in dollars)
```

### Phone Format
```typescript
formatPhone('5551234567')    // (555) 123-4567
formatPhone('15551234567')   // +1 (555) 123-4567
```

## Button Variants

### Dropdown (Recommended)
```typescript
<ExportButtons
  data={data}
  filename="Report"
  variant="dropdown"  // Single button with menu
/>
```

### Separate Buttons
```typescript
<ExportButtons
  data={data}
  filename="Report"
  variant="buttons"  // Separate CSV, PDF, Print buttons
/>
```

### Hide Specific Options
```typescript
<ExportButtons
  data={data}
  filename="Report"
  showCSV={true}
  showPDF={true}
  showPrint={false}  // Hide print button
/>
```

## PDF Options

### Portrait vs Landscape
```typescript
pdfOptions={{ orientation: 'portrait' }}  // Default
pdfOptions={{ orientation: 'landscape' }} // For wide tables
```

### Full Configuration
```typescript
pdfOptions={{
  title: 'Monthly Report',
  subtitle: 'Detailed Analysis',
  orientation: 'landscape',
  fontSize: 10,
  practiceName: 'Your Practice Name',
  practiceAddress: '123 Main St, City, ST 12345',
  includeHeader: true,
  includeFooter: true,
}}
```

## Common Export Patterns

### Patient List
```typescript
const patientColumns: ExportColumn[] = [
  { key: 'lastName', label: 'Last Name' },
  { key: 'firstName', label: 'First Name' },
  { key: 'mrn', label: 'MRN' },
  { key: 'dob', label: 'DOB', format: (date) => formatDate(date, 'short') },
  { key: 'phone', label: 'Phone', format: formatPhone },
  { key: 'email', label: 'Email' },
];
```

### Appointments
```typescript
const appointmentColumns: ExportColumn[] = [
  { key: 'scheduledStart', label: 'Date', format: (date) => formatDate(date, 'short') },
  { key: 'scheduledStart', label: 'Time', format: (date) => formatDate(date, 'time') },
  { key: 'patientName', label: 'Patient' },
  { key: 'providerName', label: 'Provider' },
  { key: 'appointmentTypeName', label: 'Type' },
  { key: 'status', label: 'Status' },
];
```

### Financial Data
```typescript
const financialColumns: ExportColumn[] = [
  { key: 'invoiceNumber', label: 'Invoice #' },
  { key: 'patientName', label: 'Patient' },
  { key: 'totalCents', label: 'Total', format: formatCurrency },
  { key: 'paidCents', label: 'Paid', format: formatCurrency },
  { key: 'balanceCents', label: 'Balance', format: formatCurrency },
  { key: 'dueDate', label: 'Due Date', format: (date) => formatDate(date, 'short') },
];
```

### Tasks
```typescript
const taskColumns: ExportColumn[] = [
  { key: 'title', label: 'Title' },
  { key: 'category', label: 'Category' },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
  { key: 'assignedToName', label: 'Assigned To' },
  { key: 'dueDate', label: 'Due Date', format: (date) => formatDate(date, 'short') },
];
```

## Custom Formatters

### Boolean to Yes/No
```typescript
{
  key: 'isActive',
  label: 'Active',
  format: (value) => value ? 'Yes' : 'No'
}
```

### Array to String
```typescript
{
  key: 'tags',
  label: 'Tags',
  format: (array) => array?.join(', ') || '-'
}
```

### Nested Object
```typescript
{
  key: 'patient',
  label: 'Patient',
  format: (patient) => `${patient?.lastName}, ${patient?.firstName}`
}
```

### Conditional Formatting
```typescript
{
  key: 'balance',
  label: 'Status',
  format: (balance) => balance > 0 ? 'Outstanding' : 'Paid'
}
```

## Direct Export (Without Component)

### CSV Export
```typescript
import { exportToCSV } from '../utils/export';

const handleExport = () => {
  exportToCSV(
    data,
    'MyData',
    {
      columns: exportColumns,
      includeTimestamp: true,
    }
  );
};
```

### PDF Export
```typescript
import { exportToPDF } from '../utils/export';

const handleExport = () => {
  exportToPDF(
    data,
    'MyReport',
    {
      title: 'Custom Report',
      columns: exportColumns,
      orientation: 'landscape',
      practiceName: 'My Practice',
    }
  );
};
```

### Print
```typescript
import { printPage } from '../utils/export';

const handlePrint = () => {
  printPage();
};
```

## Print-Specific Classes

```html
<!-- Hide from print -->
<div className="no-print">Navigation</div>

<!-- Show only in print -->
<div className="print-only">Confidential Notice</div>

<!-- Force page break before -->
<div className="page-break">New Section</div>

<!-- Avoid breaking this element -->
<div className="avoid-break">Keep together</div>
```

## Error Handling

```typescript
<ExportButtons
  data={data}
  filename="Report"
  columns={columns}
  onExport={(type) => {
    try {
      showSuccess(`Exported ${data.length} records as ${type.toUpperCase()}`);
      logExportAction('entity_type', type, data.length, session?.user.id);
    } catch (error) {
      showError('Export failed. Please try again.');
    }
  }}
/>
```

## Placement Examples

### In Action Bar
```typescript
<div className="ema-action-bar">
  <button>Action 1</button>
  <button>Action 2</button>
  <div style={{ marginLeft: 'auto' }}>
    <ExportButtons data={data} filename="Report" variant="dropdown" />
  </div>
</div>
```

### As Toolbar Item
```typescript
<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
  <button>Refresh</button>
  <ExportButtons data={data} filename="Report" variant="buttons" />
</div>
```

### Standalone
```typescript
<div style={{ marginTop: '20px' }}>
  <ExportButtons
    data={data}
    filename="Report"
    columns={columns}
    variant="dropdown"
  />
</div>
```

## Filename Convention

The system automatically generates filenames with timestamps:

```
EntityType_YYYY-MM-DD_HHMMSS.csv
EntityType_YYYY-MM-DD_HHMMSS.pdf

Examples:
Patients_2025-12-08_143052.csv
Appointments_2025-12-08_143052.pdf
```

Set `includeTimestamp: false` to disable:

```typescript
exportToCSV(data, 'Patients', { includeTimestamp: false });
// Results in: patients.csv
```

## Common Issues & Solutions

### Issue: Export button disabled
**Solution:** Check that `data` array is not empty

### Issue: Dates showing as timestamps
**Solution:** Use `format: (date) => formatDate(date, 'short')`

### Issue: Currency showing as 123456 instead of $1,234.56
**Solution:** Use `format: formatCurrency`

### Issue: Phone numbers not formatted
**Solution:** Use `format: formatPhone`

### Issue: PDF too wide for page
**Solution:** Use `orientation: 'landscape'` or reduce number of columns

### Issue: Special characters breaking CSV
**Solution:** Already handled by `exportToCSV` - no action needed

## Performance Tips

- For >1,000 records, consider showing a loading indicator
- For >10,000 records, use `validateExportSize()` to warn users
- PDF generation is slower than CSV - use CSV for very large exports
- Consider pagination for massive datasets

## HIPAA Compliance

All exports are automatically logged:

```typescript
logExportAction(
  'patients',      // Entity type
  'csv',          // Export type
  patients.length,// Record count
  user.id,        // User ID
  new Date()      // Timestamp
);
```

To integrate with backend:
1. Uncomment API call in `logExportAction()`
2. Create backend endpoint: `POST /api/audit/export`
3. Store in audit_log table

## Browser Compatibility

- ✅ Chrome, Edge, Firefox, Safari (latest)
- ❌ Internet Explorer 11 (not supported)

For IE11 support, add polyfills for:
- Promise
- Array.from
- Object.entries
