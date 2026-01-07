# Error Handling & User Feedback Enhancement Guide

## Overview

This document describes the comprehensive error handling and user feedback system implemented across the dermatology EHR application. The system provides consistent, user-friendly error handling on both frontend and backend, with proper validation, loading states, and recovery mechanisms.

## Table of Contents

1. [Frontend Error Handling](#frontend-error-handling)
2. [Backend Error Handling](#backend-error-handling)
3. [Form Validation](#form-validation)
4. [Loading States & User Feedback](#loading-states--user-feedback)
5. [Error Recovery](#error-recovery)
6. [Best Practices](#best-practices)
7. [Migration Guide](#migration-guide)

---

## Frontend Error Handling

### Core Utilities

#### Error Handling Utilities (`/frontend/src/utils/errorHandling.ts`)

Centralized error handling with the following key features:

**Key Components:**
- `ApiException` - Custom error class for API errors
- `parseErrorResponse()` - Parse error responses from API
- `getStatusMessage()` - Get user-friendly messages for HTTP status codes
- `isNetworkError()` - Detect network errors
- `isAuthError()` - Detect authentication errors
- `withRetry()` - Execute functions with retry logic
- `fetchWithTimeout()` - Fetch with timeout support

**HTTP Status Code Handling:**
- **400 (Bad Request)** - Validation errors shown inline
- **401 (Unauthorized)** - Auto-redirect to login
- **403 (Forbidden)** - Permission denied message
- **404 (Not Found)** - Resource not found
- **409 (Conflict)** - Conflict with existing data
- **422 (Validation Error)** - Field-level validation errors
- **429 (Rate Limit)** - Too many requests warning
- **500-504 (Server Errors)** - Generic server error message

**Example Usage:**

```typescript
import { ApiException, handleApiResponse, fetchWithTimeout } from '@/utils/errorHandling';

// Making an API request with timeout
try {
  const response = await fetchWithTimeout('/api/patients', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000, // 30 seconds
    credentials: 'include',
  });

  const data = await handleApiResponse(response);
} catch (error) {
  if (error instanceof ApiException) {
    console.log('Status:', error.status);
    console.log('Message:', error.message);
    console.log('Is Network Error:', error.isNetworkError);
  }
}
```

### Enhanced API Client

#### API Client (`/frontend/src/utils/apiClient.ts`)

Object-oriented API client with built-in error handling:

**Features:**
- Automatic retry logic
- Request timeout handling
- Consistent error parsing
- Authentication error handling
- File upload support

**Example Usage:**

```typescript
import { createApiClient } from '@/utils/apiClient';

const apiClient = createApiClient({
  tenantId: 'tenant-123',
  accessToken: 'token-xyz',
  onAuthError: () => {
    // Redirect to login
    window.location.href = '/login';
  },
});

// GET request with retry
const patients = await apiClient.get('/api/patients', {
  retry: true,
  maxRetries: 3,
});

// POST request
const newPatient = await apiClient.post('/api/patients', {
  firstName: 'John',
  lastName: 'Doe',
});

// File upload
const formData = new FormData();
formData.append('file', file);
const result = await apiClient.upload('/api/photos', formData);
```

### React Hooks for Async Operations

#### useAsync Hook (`/frontend/src/hooks/useAsync.ts`)

Manage async operations with loading, error, and success states:

**Available Hooks:**
- `useAsync` - General async operations
- `useFormSubmit` - Form submissions with loading state
- `useFetch` - Data fetching with retry capability

**Example Usage:**

```typescript
import { useAsync, useFormSubmit } from '@/hooks/useAsync';

// General async operation
function MyComponent() {
  const { loading, error, data, execute } = useAsync({
    showSuccessToast: true,
    showErrorToast: true,
    successMessage: 'Patient created successfully',
  });

  const handleCreate = async () => {
    await execute(async () => {
      return apiClient.post('/api/patients', formData);
    });
  };

  return (
    <div>
      {loading && <LoadingSpinner />}
      {error && <ErrorState error={error} onRetry={handleCreate} />}
      {data && <div>Success!</div>}
    </div>
  );
}

// Form submission
function MyForm() {
  const { isSubmitting, submit, error } = useFormSubmit({
    successMessage: 'Form submitted successfully',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    await submit(async () => {
      return apiClient.post('/api/endpoint', formData);
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <LoadingButton loading={isSubmitting} type="submit">
        Submit
      </LoadingButton>
    </form>
  );
}
```

---

## Form Validation

### Validation Utilities (`/frontend/src/utils/validation.ts`)

Comprehensive client-side validation with medical-specific rules.

**Common Validation Rules:**
- `required` - Required field validation
- `email` - Email format validation
- `phone` - Phone number validation
- `date` - Date validation
- `minLength` / `maxLength` - String length validation
- `min` / `max` - Number range validation
- `pattern` - Regex pattern matching
- `matches` - Field matching (e.g., password confirmation)

**Medical-Specific Rules:**
- `mrn` - Medical Record Number validation
- `icd10` - ICD-10 code validation
- `cptCode` - CPT code validation
- `npi` - NPI number validation
- `ssn` - SSN validation
- `dosage` - Medication dosage validation
- `bloodPressure` - Blood pressure validation
- `temperature` - Temperature validation (F or C)
- `heartRate` - Heart rate validation
- `weight` - Weight validation (lbs or kg)
- `height` - Height validation

**Example Usage:**

```typescript
import { Rules, MedicalRules, validateForm } from '@/utils/validation';

const patientValidation = {
  firstName: [Rules.required('First name is required')],
  lastName: [Rules.required('Last name is required')],
  email: [Rules.email()],
  phone: [Rules.phone()],
  dateOfBirth: [Rules.required(), Rules.date(), Rules.pastDate()],
  mrn: [MedicalRules.mrn()],
  weight: [MedicalRules.weight('lbs')],
};

// Validate form
const errors = await validateForm(formData, patientValidation);
if (Object.keys(errors).length > 0) {
  // Show errors
  setFormErrors(errors);
}
```

### Form Components (`/frontend/src/components/ui/Form.tsx`)

Pre-built form components with validation support:

**Available Components:**
- `Form` - Form wrapper with submit handling
- `FormField` - Field wrapper with label and error display
- `FormInput` - Text input with validation
- `FormTextarea` - Textarea with validation
- `FormSelect` - Select dropdown with validation
- `FormCheckbox` - Checkbox with validation
- `FormRadioGroup` - Radio button group
- `FormSection` - Form section divider
- `FormActions` - Action buttons container

**Example Usage:**

```typescript
import { Form, FormInput, FormSelect, FormActions } from '@/components/ui/Form';
import { LoadingButton } from '@/components/ui/LoadingButton';

function PatientForm() {
  const [errors, setErrors] = useState({});
  const { isSubmitting, submit } = useFormSubmit();

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Validate first
    const validationErrors = await validateForm(formData, validation);
    if (hasErrors(validationErrors)) {
      setErrors(validationErrors);
      return;
    }

    await submit(async () => {
      return apiClient.post('/api/patients', formData);
    });
  };

  return (
    <Form onSubmit={handleSubmit}>
      <FormInput
        label="First Name"
        name="firstName"
        value={formData.firstName}
        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
        error={errors.firstName}
        required
      />

      <FormInput
        label="Email"
        name="email"
        type="email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        error={errors.email}
        hint="We'll send appointment reminders to this address"
      />

      <FormActions>
        <LoadingButton loading={isSubmitting} type="submit">
          Save Patient
        </LoadingButton>
      </FormActions>
    </Form>
  );
}
```

---

## Loading States & User Feedback

### Toast Notifications (Enhanced)

The Toast context has been enhanced with additional features:

**New Features:**
- Multiple toast types: `ok`, `error`, `warning`, `info`
- Custom duration
- Action buttons in toasts
- Persistent toasts (require manual dismissal)
- Dismiss all functionality

**Example Usage:**

```typescript
import { useToast } from '@/contexts/ToastContext';

function MyComponent() {
  const { showSuccess, showError, showWarning, showInfo } = useToast();

  const handleAction = async () => {
    try {
      await apiClient.post('/api/action');
      showSuccess('Action completed successfully');
    } catch (error) {
      showError(getErrorMessage(error), {
        duration: 0, // Persistent
        action: {
          label: 'Retry',
          onClick: handleAction,
        },
      });
    }
  };

  // Warning with custom duration
  showWarning('This will expire your current session', {
    duration: 8000,
  });

  // Info toast
  showInfo('New features available!');
}
```

### Loading Button

Button component that prevents double-submission:

**Example Usage:**

```typescript
import { LoadingButton } from '@/components/ui/LoadingButton';

<LoadingButton
  loading={isSubmitting}
  loadingText="Saving..."
  onClick={handleSave}
  variant="primary"
>
  Save Changes
</LoadingButton>
```

### Error State Components

Display error states with retry functionality:

**Components:**
- `ErrorState` - Full error state with icon and actions
- `FieldError` - Field-level error display
- `ErrorBanner` - Inline error banner

**Example Usage:**

```typescript
import { ErrorState, ErrorBanner, FieldError } from '@/components/ui/ErrorState';

// Full page error
<ErrorState
  error={error}
  onRetry={refetch}
  onGoHome={() => navigate('/')}
  title="Failed to load patients"
/>

// Compact error with retry
<ErrorState
  error={error}
  onRetry={refetch}
  compact
/>

// Inline error banner
<ErrorBanner
  error={error}
  onDismiss={() => setError(null)}
/>

// Field error
<FieldError error={fieldError} />
```

---

## Backend Error Handling

### Error Handler Middleware (`/backend/src/middleware/errorHandler.ts`)

Centralized error handling for Express routes.

**Key Components:**
- `ApiError` - Custom error class with HTTP status codes
- `errorHandler` - Main error handling middleware
- `notFoundHandler` - 404 handler
- `asyncHandler` - Wrapper for async route handlers
- `validateRequest` - Request validation helper

**Static Error Creators:**
```typescript
ApiError.badRequest(message, details)      // 400
ApiError.unauthorized(message)             // 401
ApiError.forbidden(message)                // 403
ApiError.notFound(message)                 // 404
ApiError.conflict(message, details)        // 409
ApiError.validationError(message, errors)  // 422
ApiError.tooManyRequests(message)          // 429
ApiError.internal(message)                 // 500
```

**Example Usage in Routes:**

```typescript
import { asyncHandler, ApiError, validateRequest, validators } from '@/middleware/errorHandler';

// Async route handler with error handling
router.get('/patients/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const patient = await db.patient.findUnique({ where: { id } });

  if (!patient) {
    throw ApiError.notFound('Patient not found');
  }

  res.json(patient);
}));

// POST with validation
router.post('/patients', asyncHandler(async (req, res) => {
  // Validate request
  validateRequest({
    firstName: validators.required('First name'),
    lastName: validators.required('Last name'),
    email: validators.email,
    dateOfBirth: validators.required('Date of birth'),
  }, req.body);

  // Check for duplicate
  const existing = await db.patient.findFirst({
    where: { email: req.body.email },
  });

  if (existing) {
    throw ApiError.conflict('Patient with this email already exists');
  }

  const patient = await db.patient.create({ data: req.body });
  res.status(201).json(patient);
}));

// Custom validation error
router.put('/patients/:id', asyncHandler(async (req, res) => {
  const errors: Record<string, string> = {};

  if (!req.body.firstName) {
    errors.firstName = 'First name is required';
  }
  if (!req.body.lastName) {
    errors.lastName = 'Last name is required';
  }

  if (Object.keys(errors).length > 0) {
    throw ApiError.validationError('Validation failed', errors);
  }

  // ... update logic
}));
```

**Integration in index.ts:**

```typescript
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// ... all your routes ...

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);
```

---

## Error Recovery

### Retry Mechanism

The system includes automatic retry logic for failed requests:

**Frontend:**
```typescript
// Using API client
const data = await apiClient.get('/api/patients', {
  retry: true,
  maxRetries: 3,
});

// Using withRetry utility
import { withRetry } from '@/utils/errorHandling';

const result = await withRetry(
  async () => apiClient.get('/api/data'),
  {
    maxAttempts: 3,
    delayMs: 1000,
    backoff: true, // Exponential backoff
  }
);
```

### Undo Functionality

For destructive actions, consider implementing undo:

```typescript
function DeletePatientButton({ patientId }) {
  const { showWarning } = useToast();

  const handleDelete = async () => {
    // Optimistic delete
    removePatientFromList(patientId);

    // Show undo toast
    const toastId = showWarning('Patient deleted', {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: async () => {
          // Restore patient
          restorePatient(patientId);
        },
      },
    });

    // Wait for undo period
    setTimeout(async () => {
      // Permanent delete after timeout
      await apiClient.delete(`/api/patients/${patientId}`);
    }, 5000);
  };
}
```

---

## Best Practices

### 1. Always Include `credentials: 'include'`

All API calls must include `credentials: 'include'` for cookie-based authentication:

```typescript
fetch('/api/endpoint', {
  credentials: 'include',
  // ... other options
});
```

### 2. Use TypeScript Types

Always use proper TypeScript types for API responses:

```typescript
interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  // ...
}

const patient = await apiClient.get<Patient>('/api/patients/123');
```

### 3. Validate on Both Client and Server

Always validate on both frontend and backend:

```typescript
// Frontend validation
const errors = await validateForm(formData, validation);
if (hasErrors(errors)) return;

// Backend will also validate
const result = await apiClient.post('/api/patients', formData);
```

### 4. Provide Clear Error Messages

Use user-friendly error messages:

```typescript
// ❌ Bad
throw new Error('DB_CONSTRAINT_VIOLATION');

// ✅ Good
throw ApiError.conflict('A patient with this email already exists');
```

### 5. Handle Loading States

Always show loading indicators:

```typescript
function MyComponent() {
  const { loading, execute } = useAsync();

  if (loading) return <LoadingSpinner />;

  // ... rest of component
}
```

### 6. Log Errors Appropriately

Use the logging utility to track errors:

```typescript
import { logError } from '@/utils/errorHandling';

try {
  await someOperation();
} catch (error) {
  logError(error, 'Patient creation failed');
  throw error;
}
```

---

## Migration Guide

### Migrating Existing API Calls

**Before:**
```typescript
export async function fetchPatients(tenantId: string, accessToken: string) {
  const res = await fetch(`${API_BASE}/api/patients`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
  });
  if (!res.ok) {
    throw new Error("Failed to load patients");
  }
  return res.json();
}
```

**After (Option 1 - Enhanced Pattern):**
```typescript
export async function fetchPatients(tenantId: string, accessToken: string) {
  const response = await fetchWithTimeout(`${API_BASE}/api/patients`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [TENANT_HEADER]: tenantId,
    },
    credentials: 'include',
    timeout: 30000,
  });

  return handleApiResponse<Patient[]>(response);
}
```

**After (Option 2 - API Client):**
```typescript
// Initialize once
const apiClient = createApiClient({
  tenantId,
  accessToken,
  onAuthError: () => redirectToLogin(),
});

// Use throughout app
export async function fetchPatients() {
  return apiClient.get<Patient[]>('/api/patients', { retry: true });
}
```

### Migrating Forms

**Before:**
```typescript
function MyForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await fetch('/api/patients', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      alert('Success!');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div>{error}</div>}
      <button disabled={loading}>
        {loading ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}
```

**After:**
```typescript
import { useFormSubmit } from '@/hooks/useAsync';
import { Form, FormInput, FormActions } from '@/components/ui/Form';
import { LoadingButton } from '@/components/ui/LoadingButton';
import { Rules, validateForm } from '@/utils/validation';

function MyForm() {
  const [errors, setErrors] = useState({});
  const { isSubmitting, submit } = useFormSubmit({
    successMessage: 'Patient saved successfully',
  });

  const validation = {
    firstName: [Rules.required()],
    lastName: [Rules.required()],
    email: [Rules.email()],
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate
    const validationErrors = await validateForm(formData, validation);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    // Submit
    await submit(async () => {
      return apiClient.post('/api/patients', formData);
    });
  };

  return (
    <Form onSubmit={handleSubmit}>
      <FormInput
        label="First Name"
        name="firstName"
        value={formData.firstName}
        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
        error={errors.firstName}
        required
      />

      <FormActions>
        <LoadingButton loading={isSubmitting} type="submit">
          Save Patient
        </LoadingButton>
      </FormActions>
    </Form>
  );
}
```

### Migrating Backend Routes

**Before:**
```typescript
router.get('/patients/:id', async (req, res) => {
  try {
    const patient = await db.patient.findUnique({
      where: { id: req.params.id },
    });

    if (!patient) {
      return res.status(404).json({ error: 'Not found' });
    }

    res.json(patient);
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});
```

**After:**
```typescript
import { asyncHandler, ApiError } from '@/middleware/errorHandler';

router.get('/patients/:id', asyncHandler(async (req, res) => {
  const patient = await db.patient.findUnique({
    where: { id: req.params.id },
  });

  if (!patient) {
    throw ApiError.notFound('Patient not found');
  }

  res.json(patient);
}));
```

---

## Summary of Improvements

### Frontend
✅ Centralized error handling utilities
✅ Enhanced API client with retry and timeout
✅ Comprehensive form validation (general + medical-specific)
✅ React hooks for async operations
✅ Enhanced Toast notifications with actions
✅ Loading button to prevent double-submission
✅ Error state components with retry
✅ Form components with built-in validation

### Backend
✅ Centralized error handler middleware
✅ Custom ApiError class with static creators
✅ Async handler wrapper
✅ Request validation helpers
✅ Consistent error response format
✅ Proper HTTP status codes
✅ Error logging with context

### Best Practices
✅ All API calls include `credentials: 'include'`
✅ Proper timeout handling
✅ Network error detection
✅ Authentication error handling
✅ Retry mechanisms
✅ User-friendly error messages
✅ Loading states
✅ Success feedback
✅ Error recovery options

---

## Files Created/Modified

### New Files Created:

#### Frontend
- `/frontend/src/utils/errorHandling.ts` - Error handling utilities
- `/frontend/src/utils/apiClient.ts` - Enhanced API client
- `/frontend/src/utils/validation.ts` - Form validation utilities
- `/frontend/src/hooks/useAsync.ts` - Async operation hooks
- `/frontend/src/components/ui/ErrorState.tsx` - Error display components
- `/frontend/src/components/ui/LoadingButton.tsx` - Loading button component
- `/frontend/src/components/ui/Form.tsx` - Form components with validation
- `/frontend/src/api-enhanced.ts` - Example API service implementation

#### Backend
- `/backend/src/middleware/errorHandler.ts` - Error handling middleware

### Modified Files:
- `/frontend/src/contexts/ToastContext.tsx` - Enhanced with new features

---

## Next Steps

1. **Gradual Migration**: Migrate existing API calls and forms to use the new utilities
2. **Component Updates**: Update existing components to use new error handling
3. **Backend Integration**: Apply error handler middleware to index.ts
4. **Testing**: Test error scenarios thoroughly
5. **Documentation**: Keep this guide updated as patterns evolve

For questions or issues, refer to the example implementations in the created files.
