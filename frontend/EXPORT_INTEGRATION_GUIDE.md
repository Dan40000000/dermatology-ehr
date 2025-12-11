# Export Integration Guide

This guide shows how to integrate export functionality into the remaining pages.

## Already Integrated

✅ HomePage (Encounters)
✅ SchedulePage (Appointments)
✅ PatientsPage (Patient List)

## Pages to Integrate

### TasksPage

```typescript
// Add to imports
import { ExportButtons } from '../components/ui';
import type { ExportColumn } from '../utils/export';
import { formatDate as formatExportDate } from '../utils/export';

// Add export columns configuration
const exportColumns: ExportColumn[] = [
  { key: 'title', label: 'Title' },
  { key: 'category', label: 'Category' },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
  { key: 'assignedToName', label: 'Assigned To' },
  { key: 'patientFirstName', label: 'Patient First Name' },
  { key: 'patientLastName', label: 'Patient Last Name' },
  { key: 'dueDate', label: 'Due Date', format: (date) => formatExportDate(date, 'short') },
  { key: 'description', label: 'Description' },
  { key: 'createdAt', label: 'Created', format: (date) => formatExportDate(date, 'datetime') },
];

// Add to action bar
<div style={{ marginLeft: 'auto' }}>
  <ExportButtons
    data={filteredTasks}
    filename="Tasks"
    columns={exportColumns}
    variant="dropdown"
    pdfOptions={{ title: 'Task List', orientation: 'landscape' }}
  />
</div>
```

### MailPage (Message Threads)

```typescript
// Add to imports
import { ExportButtons } from '../components/ui';
import type { ExportColumn } from '../utils/export';
import { formatDate as formatExportDate } from '../utils/export';

// Add export columns
const exportColumns: ExportColumn[] = [
  { key: 'subject', label: 'Subject' },
  { key: 'patientFirstName', label: 'Patient First Name' },
  { key: 'patientLastName', label: 'Patient Last Name' },
  { key: 'participants', label: 'Participants', format: (p) => p?.map((x: any) => `${x.firstName} ${x.lastName}`).join(', ') },
  { key: 'unreadCount', label: 'Unread Count' },
  { key: 'createdAt', label: 'Created', format: (date) => formatExportDate(date, 'datetime') },
  { key: 'updatedAt', label: 'Last Updated', format: (date) => formatExportDate(date, 'datetime') },
];

// Add to toolbar
<ExportButtons
  data={displayedThreads}
  filename="Messages"
  columns={exportColumns}
  variant="dropdown"
  pdfOptions={{ title: 'Message Threads', orientation: 'portrait' }}
/>
```

### DocumentsPage

```typescript
// Add to imports
import { ExportButtons } from '../components/ui';
import type { ExportColumn } from '../utils/export';
import { formatDate as formatExportDate } from '../utils/export';

// Add export columns
const exportColumns: ExportColumn[] = [
  { key: 'title', label: 'Title' },
  { key: 'type', label: 'Type' },
  { key: 'category', label: 'Category' },
  { key: 'patientName', label: 'Patient' },
  { key: 'filename', label: 'Filename' },
  { key: 'mimeType', label: 'MIME Type' },
  { key: 'fileSize', label: 'Size (bytes)' },
  { key: 'storage', label: 'Storage' },
  { key: 'createdAt', label: 'Upload Date', format: (date) => formatExportDate(date, 'datetime') },
];

// Add to action bar
<ExportButtons
  data={filteredDocuments}
  filename="Documents_Metadata"
  columns={exportColumns}
  variant="dropdown"
  pdfOptions={{ title: 'Document List', orientation: 'landscape' }}
/>
```

### ClaimsPage

```typescript
// Add to imports
import { ExportButtons } from '../components/ui';
import type { ExportColumn } from '../utils/export';
import { formatDate as formatExportDate, formatCurrency } from '../utils/export';

// Add export columns
const exportColumns: ExportColumn[] = [
  { key: 'claimNumber', label: 'Claim Number' },
  { key: 'patientFirstName', label: 'Patient First Name' },
  { key: 'patientLastName', label: 'Patient Last Name' },
  { key: 'providerName', label: 'Provider' },
  { key: 'payer', label: 'Payer' },
  { key: 'totalCents', label: 'Total', format: formatCurrency },
  { key: 'status', label: 'Status' },
  { key: 'submittedAt', label: 'Submitted', format: (date) => formatExportDate(date, 'datetime') },
  { key: 'createdAt', label: 'Created', format: (date) => formatExportDate(date, 'datetime') },
];

// Add to action bar
<ExportButtons
  data={filteredClaims}
  filename="Claims"
  columns={exportColumns}
  variant="dropdown"
  pdfOptions={{ title: 'Claims Report', orientation: 'landscape' }}
/>
```

### FinancialsPage

```typescript
// Add to imports
import { ExportButtons } from '../components/ui';
import type { ExportColumn } from '../utils/export';
import { formatDate as formatExportDate, formatCurrency } from '../utils/export';

// Add export columns for invoices
const invoiceExportColumns: ExportColumn[] = [
  { key: 'invoiceNumber', label: 'Invoice #' },
  { key: 'patientName', label: 'Patient' },
  { key: 'totalAmount', label: 'Total', format: formatCurrency },
  { key: 'paidAmount', label: 'Paid', format: formatCurrency },
  { key: 'balance', label: 'Balance', format: formatCurrency },
  { key: 'status', label: 'Status' },
  { key: 'dueDate', label: 'Due Date', format: (date) => formatExportDate(date, 'short') },
  { key: 'createdAt', label: 'Created', format: (date) => formatExportDate(date, 'datetime') },
];

// Add to toolbar
<ExportButtons
  data={invoices}
  filename="Invoices"
  columns={invoiceExportColumns}
  variant="dropdown"
  pdfOptions={{ title: 'Invoice List', orientation: 'landscape' }}
/>
```

## General Pattern

For any page with tabular data:

1. **Import required utilities:**
   ```typescript
   import { ExportButtons } from '../components/ui';
   import type { ExportColumn } from '../utils/export';
   import { formatDate, formatCurrency, formatPhone } from '../utils/export';
   ```

2. **Define export columns:**
   ```typescript
   const exportColumns: ExportColumn[] = [
     { key: 'fieldName', label: 'Column Header' },
     { key: 'dateField', label: 'Date', format: (date) => formatDate(date, 'short') },
     { key: 'amountField', label: 'Amount', format: formatCurrency },
   ];
   ```

3. **Add ExportButtons component:**
   ```typescript
   <ExportButtons
     data={yourDataArray}
     filename="EntityName"
     columns={exportColumns}
     variant="dropdown" // or "buttons"
     pdfOptions={{ title: 'Report Title', orientation: 'landscape' }}
     onExport={(type) => showSuccess(`Exported as ${type.toUpperCase()}`)}
   />
   ```

## Features Included

✅ CSV Export - Properly escaped, ready for Excel
✅ PDF Export - Professional formatting with headers/footers
✅ Print - Triggers browser print dialog
✅ Automatic timestamps in filenames
✅ HIPAA audit logging (console for now, integrate with backend)
✅ Loading states
✅ Error handling
✅ Empty data validation
✅ Consistent styling

## Advanced Options

### Custom formatters

```typescript
{
  key: 'customField',
  label: 'Custom Column',
  format: (value) => {
    // Your custom formatting logic
    return value ? 'Yes' : 'No';
  }
}
```

### PDF options

```typescript
pdfOptions={{
  title: 'Custom Report Title',
  subtitle: 'Optional subtitle',
  orientation: 'landscape', // or 'portrait'
  practiceName: 'Your Practice Name',
  practiceAddress: '123 Main St, City, ST 12345',
  dateRange: {
    start: startDate,
    end: endDate,
  },
}}
```

### Variant options

- `variant="dropdown"` - Single dropdown button with menu
- `variant="buttons"` - Separate CSV, PDF, Print buttons

## Print Styling

All pages automatically get print styles from `/frontend/src/styles/print.css`:

- Hides navigation, sidebars, and action buttons
- Professional table formatting
- Page breaks
- Headers and footers
- HIPAA confidentiality notice

Add `.no-print` class to any element you want hidden when printing.
Add `.print-only` class to elements that should only appear in print.

## Next Steps

1. Add export to remaining pages listed above
2. Integrate audit logging with backend API
3. Add export preferences modal for column selection
4. Implement background exports for very large datasets
5. Add email export option (send PDF/CSV via email)
