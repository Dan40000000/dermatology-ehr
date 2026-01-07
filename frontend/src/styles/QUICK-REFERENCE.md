# UI Component Quick Reference Guide

## Common UI Patterns

### Page Structure
```tsx
import { PageHeader, Button } from '@/components/ui';

<PageHeader
  title="Page Title"
  subtitle="Optional description"
  breadcrumbs={[
    { label: 'Home', href: '/' },
    { label: 'Section' },
    { label: 'Current Page' }
  ]}
  actions={
    <>
      <Button variant="ghost">Secondary Action</Button>
      <Button variant="primary">Primary Action</Button>
    </>
  }
/>
```

### Buttons
```tsx
import { Button } from '@/components/ui';

// Variants
<Button variant="primary">Save</Button>
<Button variant="ghost">Cancel</Button>
<Button variant="danger">Delete</Button>
<Button variant="success">Approve</Button>
<Button variant="warning">Warning</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>

// States
<Button disabled>Disabled</Button>
<Button loading>Loading...</Button>
<Button fullWidth>Full Width</Button>
```

### Modals
```tsx
import { Modal, Button } from '@/components/ui';

<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Modal Title"
  size="md"
  footer={
    <>
      <Button variant="ghost" onClick={() => setIsOpen(false)}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleSave}>
        Save
      </Button>
    </>
  }
>
  <p>Modal content goes here</p>
</Modal>
```

### Forms
```tsx
import { FormField, FormInput, FormSelect, FormCheckbox } from '@/components/ui/Form';

// Text Input
<FormInput
  label="Patient Name"
  name="patientName"
  required
  error={errors.patientName}
  hint="Enter the patient's full name"
/>

// Select
<FormSelect
  label="Status"
  name="status"
  options={[
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ]}
  placeholder="Select status"
  required
  error={errors.status}
/>

// Checkbox
<FormCheckbox
  label="Send notification"
  name="notify"
  hint="Email will be sent to patient"
/>

// Form Actions
<FormActions align="right">
  <Button variant="ghost">Cancel</Button>
  <Button type="submit">Save</Button>
</FormActions>
```

### Empty States
```tsx
import { EmptyState, NoPatients, NoAppointments } from '@/components/ui';

// Generic
<EmptyState
  icon="📋"
  title="No records found"
  description="Try adjusting your filters"
  action={{ label: 'Clear Filters', onClick: handleClear }}
/>

// Prebuilt
<NoPatients onAddPatient={handleAdd} />
<NoAppointments onAddAppointment={handleAdd} />
```

### Loading States
```tsx
import { LoadingSpinner, Skeleton } from '@/components/ui';

// Full page loading
<LoadingSpinner size="lg" overlay message="Loading data..." />

// Inline loading
<LoadingSpinner size="sm" />

// Skeleton loader
<Skeleton height={40} width="100%" />
<SkeletonList count={5} />
```

### Pills/Badges
```tsx
import { Pill } from '@/components/ui';

<Pill>Default</Pill>
<Pill className="pill-success">Active</Pill>
<Pill className="pill-warning">Pending</Pill>
<Pill className="pill-error">Cancelled</Pill>
```

---

## CSS Classes Quick Reference

### Layout
```css
.page-header          /* Page header container */
.section-header       /* Section header */
.content-card         /* Main content card */
.panel                /* Panel/card component */
```

### Typography
```css
.page-title           /* Large page title */
.page-subtitle        /* Subtitle/description */
.muted                /* Muted text */
.strong               /* Bold text */
.tiny                 /* Small text */
```

### Buttons
```css
.btn                  /* Base button */
.btn.ghost            /* Ghost button */
.btn.danger           /* Danger button */
.btn.success          /* Success button */
.btn.warning          /* Warning button */
.btn-sm               /* Small button */
.btn-lg               /* Large button */
.btn-full-width       /* Full width button */
```

### Forms
```css
.form-field           /* Form field wrapper */
.form-label           /* Form label */
.form-hint            /* Help text */
.form-field.has-error /* Error state */
.required-indicator   /* Required asterisk */
.form-actions         /* Form action buttons */
```

### Status
```css
.pill                 /* Status pill */
.pill.subtle          /* Neutral pill */
.pill.warn            /* Warning pill */
.status-badge         /* Status indicator */
```

### Utilities
```css
.hide-mobile          /* Hide on mobile */
.show-mobile          /* Show only on mobile */
.hide-desktop         /* Hide on desktop */
.show-desktop         /* Show only on desktop */
```

---

## CSS Variables Quick Reference

### Colors
```css
/* Primary */
var(--primary-900)    /* Darkest blue */
var(--primary-700)    /* Brand blue */
var(--primary-500)    /* Light blue */
var(--primary-100)    /* Very light blue */

/* Accent */
var(--accent-600)     /* Dark action blue */
var(--accent-500)     /* Action blue */

/* Neutrals */
var(--gray-900)       /* Black text */
var(--gray-700)       /* Dark gray */
var(--gray-500)       /* Medium gray */
var(--gray-300)       /* Light gray */
var(--gray-100)       /* Background gray */
var(--white)          /* White */

/* Status */
var(--success-600)    /* Success green */
var(--warning-600)    /* Warning orange */
var(--error-600)      /* Error red */
```

### Spacing
```css
/* Standard spacing (use these!) */
0.25rem  /* 4px - xs */
0.5rem   /* 8px - sm */
0.75rem  /* 12px - md */
1rem     /* 16px - lg */
1.5rem   /* 24px - xl */
```

### Border Radius
```css
var(--radius-sm)      /* 4px */
var(--radius-md)      /* 8px */
var(--radius-lg)      /* 12px */
var(--radius-xl)      /* 16px */
```

### Shadows
```css
var(--shadow-sm)      /* Subtle */
var(--shadow-md)      /* Standard */
var(--shadow-lg)      /* Elevated */
var(--shadow-xl)      /* Modal */
```

---

## Breakpoints
```css
/* Mobile First */
@media (max-width: 768px)   { /* Mobile */ }
@media (min-width: 768px)   { /* Tablet+ */ }
@media (min-width: 1024px)  { /* Desktop+ */ }
@media (min-width: 1280px)  { /* Large desktop+ */ }
```

---

## Common Patterns

### Responsive Grid
```tsx
<div className="grid">
  {items.map(item => (
    <div className="panel" key={item.id}>
      {/* Content */}
    </div>
  ))}
</div>
```

### Data Table
```tsx
import { DataTable } from '@/components/ui';

<DataTable
  columns={[
    { key: 'name', label: 'Name', sortable: true },
    { key: 'status', label: 'Status' }
  ]}
  data={patients}
  onRowClick={handleRowClick}
/>
```

### Filters Bar
```tsx
<div className="filters">
  <label>
    <span>Search</span>
    <input type="text" placeholder="Search..." />
  </label>
  <label>
    <span>Status</span>
    <select>
      <option value="">All</option>
      <option value="active">Active</option>
    </select>
  </label>
  <Button className="btn-filter">Apply</Button>
</div>
```

### Stats Cards
```tsx
<div className="stats-row">
  <div className="stat-card">
    <div className="strong">124</div>
    <div className="muted">Total Patients</div>
  </div>
  <div className="stat-card">
    <div className="strong">18</div>
    <div className="muted">Today's Appointments</div>
  </div>
</div>
```

---

## Best Practices

### Do's ✅
- Use CSS variables for colors
- Use component imports from `@/components/ui`
- Follow mobile-first approach
- Use semantic HTML
- Add ARIA labels for accessibility
- Use existing spacing variables
- Follow naming conventions

### Don'ts ❌
- Don't hardcode colors
- Don't use inline styles
- Don't skip accessibility attributes
- Don't forget responsive design
- Don't duplicate CSS
- Don't use magic numbers

---

## Need Help?

1. Check `/frontend/src/styles/design-system.md` for detailed guidelines
2. Look at existing components for examples
3. Use browser DevTools to inspect styling
4. Test on multiple screen sizes
5. Run accessibility tests

---

**Last Updated:** December 29, 2025
