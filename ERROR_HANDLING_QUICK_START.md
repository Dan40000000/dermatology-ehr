# Error Handling Quick Start Guide

Quick reference for implementing error handling in the dermatology EHR application.

## Quick Links

- [Frontend Patterns](#frontend-patterns)
- [Backend Patterns](#backend-patterns)
- [Common Use Cases](#common-use-cases)

---

## Frontend Patterns

### 1. Simple API Call with Error Handling

```typescript
import { useAsync } from '@/hooks/useAsync';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

function PatientsList() {
  const { loading, error, data, execute } = useAsync();

  useEffect(() => {
    execute(async () => {
      return apiClient.get('/api/patients');
    });
  }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState error={error} onRetry={() => execute()} />;

  return <div>{/* render patients */}</div>;
}
```

### 2. Form Submission

```typescript
import { useFormSubmit } from '@/hooks/useAsync';
import { LoadingButton } from '@/components/ui/LoadingButton';
import { Rules, validateForm } from '@/utils/validation';

function CreatePatientForm() {
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});
  const { isSubmitting, submit } = useFormSubmit({
    successMessage: 'Patient created successfully',
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
    <form onSubmit={handleSubmit}>
      <input
        name="firstName"
        value={formData.firstName}
        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
      />
      {errors.firstName && <span className="error">{errors.firstName}</span>}

      <LoadingButton loading={isSubmitting} type="submit">
        Create Patient
      </LoadingButton>
    </form>
  );
}
```

### 3. Using Form Components

```typescript
import { Form, FormInput, FormActions } from '@/components/ui/Form';
import { LoadingButton } from '@/components/ui/LoadingButton';

function PatientForm() {
  const { isSubmitting, submit } = useFormSubmit();
  const [errors, setErrors] = useState({});

  return (
    <Form onSubmit={handleSubmit}>
      <FormInput
        label="First Name"
        name="firstName"
        value={formData.firstName}
        onChange={handleChange}
        error={errors.firstName}
        required
      />

      <FormInput
        label="Email"
        name="email"
        type="email"
        value={formData.email}
        onChange={handleChange}
        error={errors.email}
        hint="For appointment reminders"
      />

      <FormActions>
        <LoadingButton loading={isSubmitting} type="submit">
          Save
        </LoadingButton>
      </FormActions>
    </Form>
  );
}
```

### 4. Toast Notifications

```typescript
import { useToast } from '@/contexts/ToastContext';

function MyComponent() {
  const { showSuccess, showError, showWarning } = useToast();

  const handleAction = async () => {
    try {
      await apiClient.post('/api/action');
      showSuccess('Action completed');
    } catch (error) {
      showError('Action failed', {
        action: {
          label: 'Retry',
          onClick: handleAction,
        },
      });
    }
  };

  // Warning that auto-dismisses after 5 seconds
  showWarning('Session will expire soon', { duration: 5000 });
}
```

### 5. File Upload

```typescript
function PhotoUpload({ patientId }) {
  const { isSubmitting, submit } = useFormSubmit({
    successMessage: 'Photo uploaded successfully',
  });

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('photo', file);
    formData.append('patientId', patientId);

    await submit(async () => {
      return apiClient.upload('/api/photos', formData, {
        timeout: 60000, // 60 seconds for uploads
      });
    });
  };

  return (
    <input
      type="file"
      onChange={(e) => handleUpload(e.target.files[0])}
      disabled={isSubmitting}
    />
  );
}
```

---

## Backend Patterns

### 1. Simple GET Route

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

### 2. POST with Validation

```typescript
import { asyncHandler, ApiError, validateRequest, validators } from '@/middleware/errorHandler';

router.post('/patients', asyncHandler(async (req, res) => {
  // Validate request
  validateRequest({
    firstName: validators.required('First name'),
    lastName: validators.required('Last name'),
    email: validators.email,
  }, req.body);

  // Check for duplicates
  const existing = await db.patient.findFirst({
    where: { email: req.body.email },
  });

  if (existing) {
    throw ApiError.conflict('Patient with this email already exists');
  }

  // Create patient
  const patient = await db.patient.create({
    data: req.body,
  });

  res.status(201).json(patient);
}));
```

### 3. Custom Validation Errors

```typescript
router.put('/patients/:id', asyncHandler(async (req, res) => {
  const errors: Record<string, string> = {};

  // Custom validation logic
  if (!req.body.firstName) {
    errors.firstName = 'First name is required';
  }
  if (req.body.age && req.body.age < 0) {
    errors.age = 'Age must be positive';
  }

  if (Object.keys(errors).length > 0) {
    throw ApiError.validationError('Validation failed', errors);
  }

  const patient = await db.patient.update({
    where: { id: req.params.id },
    data: req.body,
  });

  res.json(patient);
}));
```

### 4. Authorization Check

```typescript
router.delete('/patients/:id', asyncHandler(async (req, res) => {
  // Check permissions
  if (req.user.role !== 'admin') {
    throw ApiError.forbidden('Only administrators can delete patients');
  }

  const patient = await db.patient.findUnique({
    where: { id: req.params.id },
  });

  if (!patient) {
    throw ApiError.notFound('Patient not found');
  }

  await db.patient.delete({ where: { id: req.params.id } });

  res.status(204).send();
}));
```

---

## Common Use Cases

### 1. Medical Field Validation

```typescript
import { MedicalRules } from '@/utils/validation';

const vitalSignsValidation = {
  bloodPressure: [MedicalRules.bloodPressure()],
  heartRate: [MedicalRules.heartRate()],
  temperature: [MedicalRules.temperature('F')],
  weight: [MedicalRules.weight('lbs')],
};

const errors = await validateForm(vitalsData, vitalSignsValidation);
```

### 2. Data Fetching with Retry

```typescript
import { useFetch } from '@/hooks/useAsync';

function PatientData({ patientId }) {
  const { loading, error, data, refetch, canRetry } = useFetch({
    retry: true,
  });

  useEffect(() => {
    refetch(async () => {
      return apiClient.get(`/api/patients/${patientId}`);
    });
  }, [patientId]);

  if (loading) return <LoadingSpinner />;
  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={canRetry ? refetch : undefined}
      />
    );
  }

  return <PatientDetails patient={data} />;
}
```

### 3. Optimistic Updates with Undo

```typescript
function DeleteButton({ patientId }) {
  const { showWarning } = useToast();
  const [patients, setPatients] = useState([]);

  const handleDelete = async () => {
    // Optimistically remove from list
    const removedPatient = patients.find(p => p.id === patientId);
    setPatients(patients.filter(p => p.id !== patientId));

    // Show undo option
    showWarning('Patient deleted', {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          // Restore patient
          setPatients([...patients, removedPatient]);
        },
      },
    });

    // Permanent delete after timeout
    setTimeout(async () => {
      await apiClient.delete(`/api/patients/${patientId}`);
    }, 5000);
  };

  return <button onClick={handleDelete}>Delete</button>;
}
```

### 4. Network Error Detection

```typescript
import { isNetworkError, isAuthError } from '@/utils/errorHandling';

try {
  await apiClient.get('/api/data');
} catch (error) {
  if (isNetworkError(error)) {
    showError('Network error. Please check your connection.');
  } else if (isAuthError(error)) {
    // Redirect to login
    navigate('/login');
  } else {
    showError('An error occurred');
  }
}
```

### 5. Conditional Validation

```typescript
import { Rules } from '@/utils/validation';

const patientValidation = {
  firstName: [Rules.required()],
  lastName: [Rules.required()],
  email: [Rules.email()],
  // Conditional: phone required if email not provided
  phone: [
    Rules.custom(
      (value, formData) => {
        if (!formData.email && !value) {
          return false;
        }
        return true;
      },
      'Either email or phone is required'
    ),
  ],
};
```

---

## Cheat Sheet

### Frontend Error Handling

| Task | Code |
|------|------|
| API call with loading | `const { loading, error, data, execute } = useAsync()` |
| Form submission | `const { isSubmitting, submit } = useFormSubmit()` |
| Show success toast | `showSuccess('Success message')` |
| Show error toast | `showError('Error message')` |
| Validate form | `const errors = await validateForm(data, validation)` |
| Detect network error | `if (isNetworkError(error)) { }` |
| Retry failed request | `<ErrorState error={error} onRetry={refetch} />` |

### Backend Error Handling

| Task | Code |
|------|------|
| Not found error | `throw ApiError.notFound('Resource not found')` |
| Validation error | `throw ApiError.validationError('Message', errors)` |
| Unauthorized | `throw ApiError.unauthorized()` |
| Forbidden | `throw ApiError.forbidden()` |
| Conflict | `throw ApiError.conflict('Duplicate found')` |
| Async route handler | `router.get('/path', asyncHandler(async (req, res) => {}))` |
| Validate request | `validateRequest({ field: validators.required('Field') }, req.body)` |

### Validation Rules

| Rule | Code |
|------|------|
| Required | `Rules.required('Message')` |
| Email | `Rules.email()` |
| Phone | `Rules.phone()` |
| Min length | `Rules.minLength(5)` |
| Number range | `Rules.min(0), Rules.max(100)` |
| Blood pressure | `MedicalRules.bloodPressure()` |
| ICD-10 code | `MedicalRules.icd10()` |
| CPT code | `MedicalRules.cptCode()` |

---

## Status Codes Reference

| Code | Meaning | When to Use |
|------|---------|-------------|
| 200 | OK | Successful GET, PUT, PATCH |
| 201 | Created | Successful POST (resource created) |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Invalid request format |
| 401 | Unauthorized | Not authenticated |
| 403 | Forbidden | Authenticated but not authorized |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource |
| 422 | Unprocessable Entity | Validation error |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

---

## Testing Error Scenarios

```typescript
// Test network error
fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

// Test 401 error
fetch.mockResolvedValueOnce({
  ok: false,
  status: 401,
  json: async () => ({ error: 'Unauthorized' }),
});

// Test validation error
fetch.mockResolvedValueOnce({
  ok: false,
  status: 422,
  json: async () => ({
    error: 'Validation failed',
    details: {
      errors: {
        email: 'Invalid email format',
      },
    },
  }),
});
```

---

For detailed documentation, see [ERROR_HANDLING_GUIDE.md](./ERROR_HANDLING_GUIDE.md)
