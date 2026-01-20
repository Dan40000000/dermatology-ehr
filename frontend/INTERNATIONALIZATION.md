# Internationalization (i18n) Implementation Guide

## Overview

This document provides a comprehensive guide for the i18n implementation in the derm-app frontend. The application now supports 4 languages: English, Spanish, French, and Chinese.

## 🎯 What Has Been Implemented

### 1. Core Infrastructure

- ✅ **i18n Configuration** (`src/i18n/index.ts`)
  - Configured react-i18next with language detection
  - Set up 4 languages: en (default), es, fr, zh
  - Configured 9 translation namespaces
  - Automatic language persistence to localStorage

- ✅ **Translation Files** (`src/i18n/locales/`)
  - Complete translation files for all 4 languages
  - 9 namespaces per language (36 total files):
    - common.json - Shared UI strings
    - auth.json - Authentication flows
    - patients.json - Patient management
    - appointments.json - Scheduling
    - clinical.json - Clinical notes and terminology
    - billing.json - Financial operations
    - admin.json - Administration
    - errors.json - Error messages
    - validation.json - Form validations

### 2. Components Created

- ✅ **LanguageSwitcher** (`src/components/LanguageSwitcher.tsx`)
  - Dropdown with flag icons for all 4 languages
  - Integrated into login page and main app header
  - Persists selection to localStorage
  - Accessible and keyboard-navigable

- ✅ **LanguagePreferenceSettings** (`src/components/LanguagePreferenceSettings.tsx`)
  - Full settings component for user preferences
  - Two variants: card and inline
  - Visual language selection with flags
  - Can be integrated into settings/preferences pages

### 3. Hooks Created

- ✅ **useLanguagePreference** (`src/hooks/useLanguagePreference.ts`)
  - Custom hook for language preference management
  - Syncs with localStorage
  - Ready for backend integration

### 4. Components Updated with i18n

- ✅ **LoginPage** - Full translation support
- ✅ **TopBar** - Language switcher integrated
- ✅ **PreferencesPage** - Language settings added
- ✅ **main.tsx** - i18n imported and initialized

## 📋 Next Steps for Full Implementation

### Priority 1: Navigation Components

```tsx
// MainNav.tsx
import { useTranslation } from 'react-i18next';

export function MainNav() {
  const { t } = useTranslation('common');

  return (
    <nav>
      <NavLink to="/home">{t('navigation.home')}</NavLink>
      <NavLink to="/schedule">{t('navigation.schedule')}</NavLink>
      <NavLink to="/patients">{t('navigation.patients')}</NavLink>
      {/* etc. */}
    </nav>
  );
}
```

### Priority 2: Core Pages

Update these pages in order of usage frequency:

1. **PatientsPage.tsx**
   ```tsx
   const { t } = useTranslation(['patients', 'common']);
   // Replace: "New Patient" → t('patients:newPatient')
   // Replace: "Patient List" → t('patients:patientList')
   ```

2. **SchedulePage.tsx**
   ```tsx
   const { t } = useTranslation(['appointments', 'common']);
   // Replace: "New Appointment" → t('appointments:newAppointment')
   // Replace: "Schedule" → t('appointments:schedule')
   ```

3. **HomePage.tsx**
4. **TasksPage.tsx**
5. **MailPage.tsx**

### Priority 3: Form Components

All form components should use validation namespace:

```tsx
const { t } = useTranslation(['validation', 'patients']);

// Field labels
<label>{t('patients:fields.firstName')}</label>

// Validation errors
{errors.email && <span>{t('validation:email')}</span>}
```

### Priority 4: Modal Components

Update all modals to use appropriate translations:

```tsx
// Example: PatientModal
const { t } = useTranslation(['patients', 'common']);

<Modal title={t('patients:newPatient')}>
  <button>{t('common:buttons.save')}</button>
  <button>{t('common:buttons.cancel')}</button>
</Modal>
```

### Priority 5: Toast/Success Messages

Replace all hardcoded success/error messages:

```tsx
// Before
toast.success('Patient created successfully');

// After
const { t } = useTranslation('patients');
toast.success(t('messages.patientCreated'));
```

## 🔧 Development Workflow

### Adding New Translations

1. **Identify the string to translate**
2. **Choose appropriate namespace** (common, patients, etc.)
3. **Add to English file first** (always the source of truth)
4. **Add to other language files** (es, fr, zh)
5. **Use in component** with `t()` function

Example workflow:

```bash
# 1. Add to English file
# src/i18n/locales/en/patients.json
{
  "actions": {
    "mergeDuplicates": "Merge Duplicates"
  }
}

# 2. Add to Spanish file
# src/i18n/locales/es/patients.json
{
  "actions": {
    "mergeDuplicates": "Fusionar Duplicados"
  }
}

# 3. Add to French and Chinese files
# ... (similar process)

# 4. Use in component
const { t } = useTranslation('patients');
<button>{t('actions.mergeDuplicates')}</button>
```

## 🌍 Language-Specific Considerations

### Spanish (es)
- Uses formal "usted" form (appropriate for medical settings)
- Proper medical terminology (e.g., "Presión Arterial" not "Presión de Sangre")
- Special characters: ñ, á, é, í, ó, ú, ü

### French (fr)
- Uses formal "vous" form
- Accents: é, è, ê, à, ù, ç
- Gender-specific terms considered

### Chinese (zh)
- Simplified Chinese characters
- Medical terms use standard medical Chinese
- No spaces between words
- Consider character length (shorter than English)

## 🎨 UI Considerations

### Text Expansion

Languages expand at different rates compared to English:

| Language | Expansion Rate |
|----------|----------------|
| Spanish  | +20-30%        |
| French   | +15-25%        |
| Chinese  | -30-40%        |

**Action Required:**
- Test UI layouts with all languages
- Ensure buttons don't overflow
- Check dropdown widths
- Verify mobile responsiveness

### Date and Number Formatting

Use `Intl` APIs for locale-specific formatting:

```tsx
// Dates
const date = new Date();
const formatted = new Intl.DateTimeFormat(i18n.language).format(date);

// Currency
const amount = 1234.56;
const formatted = new Intl.NumberFormat(i18n.language, {
  style: 'currency',
  currency: 'USD'
}).format(amount);

// Numbers
const number = 1234567.89;
const formatted = new Intl.NumberFormat(i18n.language).format(number);
```

## 🧪 Testing

### Manual Testing Checklist

- [ ] Switch languages using LanguageSwitcher
- [ ] Verify localStorage persistence (refresh page)
- [ ] Check all navigation labels
- [ ] Test form labels and placeholders
- [ ] Verify error messages display correctly
- [ ] Check modal titles and buttons
- [ ] Test success/error toasts
- [ ] Verify no layout breaks with long translations
- [ ] Test on mobile devices
- [ ] Check RTL support (if added)

### Automated Testing

Add tests for i18n:

```tsx
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';

test('renders component in Spanish', async () => {
  await i18n.changeLanguage('es');

  render(
    <I18nextProvider i18n={i18n}>
      <MyComponent />
    </I18nextProvider>
  );

  expect(screen.getByText('Guardar')).toBeInTheDocument();
});
```

## 📊 Translation Coverage

### Current Coverage

| Category | Status | Percentage |
|----------|--------|------------|
| Core Infrastructure | ✅ Complete | 100% |
| Translation Files | ✅ Complete | 100% |
| Login/Auth | ✅ Complete | 100% |
| Navigation | 🚧 Partial | 20% |
| Patient Management | 🚧 Partial | 10% |
| Scheduling | 🚧 Partial | 5% |
| Clinical | ⏳ Todo | 0% |
| Billing | ⏳ Todo | 0% |
| Admin | ⏳ Todo | 5% |
| Forms | ⏳ Todo | 0% |
| Modals | ⏳ Todo | 0% |
| Error Messages | ⏳ Todo | 0% |

**Overall Coverage: ~15%**

### Target Coverage: 100% by End of Sprint

## 🚀 Migration Strategy

### Phase 1: Foundation (✅ Complete)
- Install dependencies
- Configure i18n
- Create translation files
- Build components

### Phase 2: Critical Path (In Progress)
- Login/Auth flows
- Main navigation
- Patient search
- Core actions

### Phase 3: Feature Pages (Next)
- Patients module
- Scheduling module
- Clinical notes
- Billing

### Phase 4: Polish (Final)
- All modals
- All forms
- All error states
- All success messages
- Edge cases

## 🔗 Backend Integration

### User Preference Endpoint

To persist language preference to database:

```typescript
// API endpoint needed:
// PATCH /api/users/:id/preferences
{
  "language": "es"
}

// Update useLanguagePreference hook:
const setLanguage = async (languageCode: string) => {
  await i18n.changeLanguage(languageCode);
  localStorage.setItem('i18nextLng', languageCode);

  // Sync with backend
  try {
    await fetch(`/api/users/me/preferences`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: languageCode })
    });
  } catch (error) {
    console.error('Failed to save language preference:', error);
  }
};
```

### Loading User Preference

```typescript
// On app initialization (AuthContext or similar):
const loadUserPreferences = async () => {
  const response = await fetch('/api/users/me/preferences');
  const { language } = await response.json();

  if (language) {
    i18n.changeLanguage(language);
  }
};
```

## 📚 Resources

- **i18n README**: `src/i18n/README.md` - Usage examples and best practices
- **react-i18next docs**: https://react.i18next.com/
- **Medical Spanish**: https://www.ama-assn.org/delivering-care/population-care/medical-spanish-guide

## 🤝 Contributing

When adding new features:

1. ✅ Add translation keys to all 4 language files
2. ✅ Use descriptive namespace:key format
3. ✅ Test with all languages
4. ✅ Update this document if adding new namespaces
5. ✅ Review medical terminology with native speakers

## ⚠️ Common Pitfalls

1. **Don't concatenate translated strings**
   ```tsx
   // ❌ Bad
   t('hello') + ' ' + name + ' ' + t('welcome')

   // ✅ Good - use interpolation
   t('greeting', { name })  // "Hello {{name}}, welcome!"
   ```

2. **Don't use translation keys as defaults**
   ```tsx
   // ❌ Bad
   t('Save')  // Falls back to key itself

   // ✅ Good
   t('common:buttons.save')  // Falls back to English
   ```

3. **Don't forget pluralization**
   ```tsx
   // Use i18next plural handling
   // Translation: { "item": "item", "item_plural": "items" }
   t('item', { count: 1 })  // "item"
   t('item', { count: 5 })  // "items"
   ```

4. **Don't hardcode dates/numbers**
   ```tsx
   // ❌ Bad
   new Date().toLocaleDateString('en-US')

   // ✅ Good
   new Date().toLocaleDateString(i18n.language)
   ```

## 📧 Questions?

Contact the frontend team or check:
- i18n README: `src/i18n/README.md`
- react-i18next documentation
- Team Slack channel: #frontend-i18n
