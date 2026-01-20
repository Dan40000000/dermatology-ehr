# Internationalization (i18n) Guide

This application uses `react-i18next` for internationalization support. The app currently supports 4 languages:

- English (en) - Default
- Spanish (es)
- French (fr)
- Chinese (zh)

## 🌍 Supported Languages

| Language | Code | Flag |
|----------|------|------|
| English  | en   | 🇺🇸   |
| Spanish  | es   | 🇪🇸   |
| French   | fr   | 🇫🇷   |
| Chinese  | zh   | 🇨🇳   |

## 📁 File Structure

```
frontend/src/i18n/
├── index.ts                    # i18n configuration
├── locales/
│   ├── en/                     # English translations
│   │   ├── common.json
│   │   ├── auth.json
│   │   ├── patients.json
│   │   ├── appointments.json
│   │   ├── clinical.json
│   │   ├── billing.json
│   │   ├── admin.json
│   │   ├── errors.json
│   │   └── validation.json
│   ├── es/                     # Spanish translations
│   │   └── [same files]
│   ├── fr/                     # French translations
│   │   └── [same files]
│   └── zh/                     # Chinese translations
│       └── [same files]
```

## 📚 Translation Namespaces

Translations are organized into the following namespaces:

1. **common** - Shared strings (buttons, labels, navigation, status messages)
2. **auth** - Authentication (login, logout, password reset)
3. **patients** - Patient management (forms, actions, demographics)
4. **appointments** - Scheduling and appointments
5. **clinical** - Clinical notes, vitals, diagnoses, procedures
6. **billing** - Billing, charges, payments, claims
7. **admin** - Administration, users, providers, settings
8. **errors** - Error messages
9. **validation** - Form validation messages

## 🚀 Usage Examples

### Basic Usage in Components

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('common');

  return (
    <div>
      <h1>{t('appName')}</h1>
      <button>{t('buttons.save')}</button>
      <p>{t('messages.loading')}</p>
    </div>
  );
}
```

### Using Multiple Namespaces

```tsx
import { useTranslation } from 'react-i18next';

function PatientForm() {
  const { t } = useTranslation(['patients', 'common']);

  return (
    <form>
      <label>{t('patients:fields.firstName')}</label>
      <button type="submit">{t('common:buttons.save')}</button>
    </form>
  );
}
```

### With Interpolation

```tsx
// In your component
const { t } = useTranslation('validation');

// Translation file: { "required": "{{field}} is required" }
const errorMessage = t('required', { field: 'Email' });
// Output: "Email is required"
```

### Language Switcher Component

The `LanguageSwitcher` component is already integrated in:
- Login page (top-right corner)
- Main application header (TopBar component)

```tsx
import { LanguageSwitcher } from './components/LanguageSwitcher';

function Header() {
  return (
    <header>
      <LanguageSwitcher />
    </header>
  );
}
```

## 🔧 Translation Helper Functions

### Get Current Language

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { i18n } = useTranslation();
  const currentLanguage = i18n.language; // 'en', 'es', 'fr', or 'zh'

  return <div>Current language: {currentLanguage}</div>;
}
```

### Change Language Programmatically

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { i18n } = useTranslation();

  const changeToSpanish = () => {
    i18n.changeLanguage('es');
  };

  return <button onClick={changeToSpanish}>Cambiar a Español</button>;
}
```

## 📝 Adding New Translations

### 1. Add to English translation file first

```json
// locales/en/common.json
{
  "myNewSection": {
    "title": "My Title",
    "description": "My Description"
  }
}
```

### 2. Add translations to other languages

```json
// locales/es/common.json
{
  "myNewSection": {
    "title": "Mi Título",
    "description": "Mi Descripción"
  }
}
```

### 3. Use in component

```tsx
const { t } = useTranslation('common');
return <h1>{t('myNewSection.title')}</h1>;
```

## 🏥 Medical Terminology (Spanish)

Our Spanish translations include proper medical terminology:

| English | Spanish |
|---------|---------|
| Chief Complaint | Motivo Principal de Consulta |
| Vitals | Signos Vitales |
| Blood Pressure | Presión Arterial |
| Biopsy | Biopsia |
| Cryotherapy | Crioterapia |
| Dermatology | Dermatología |
| Diagnosis | Diagnóstico |
| Prescription | Receta/Prescripción |
| Follow-up | Seguimiento |

## 🎯 Best Practices

1. **Always use translation keys** - Never hardcode user-facing strings
2. **Use namespaces** - Keep translations organized by feature
3. **Provide context** - Use descriptive keys like `auth:login.title` instead of just `title`
4. **Test all languages** - Verify UI doesn't break with longer translations
5. **Handle pluralization** - Use i18next's built-in plural support when needed
6. **Date/number formatting** - Consider using `Intl` APIs for locale-specific formatting

## 🔄 Switching Languages

Users can switch languages in two ways:

1. **LanguageSwitcher Component** - Dropdown with flag icons
2. **Preferences/Settings** - Save language preference to user profile (to be implemented)

The selected language is persisted in `localStorage` and automatically loaded on page refresh.

## 📱 Components Already Translated

✅ LoginPage
✅ TopBar
✅ LanguageSwitcher

## 📋 Components to Translate

The following components should be updated to use translations:

- [ ] MainNav.tsx
- [ ] SubNav.tsx
- [ ] Footer.tsx
- [ ] PatientsPage.tsx
- [ ] SchedulePage.tsx
- [ ] HomePage.tsx
- [ ] TasksPage.tsx
- [ ] MailPage.tsx
- [ ] DocumentsPage.tsx
- [ ] PrescriptionsPage.tsx
- [ ] OrdersPage.tsx
- [ ] AnalyticsPage.tsx
- [ ] AdminPage.tsx
- [ ] All form components
- [ ] All modal components
- [ ] Error states
- [ ] Success messages

## 🛠️ Example: Translating a Component

### Before (Hardcoded English)

```tsx
export function PatientCard({ patient }: Props) {
  return (
    <div className="patient-card">
      <h2>Patient Details</h2>
      <p>Name: {patient.firstName} {patient.lastName}</p>
      <p>Email: {patient.email}</p>
      <button>Edit Patient</button>
    </div>
  );
}
```

### After (With i18n)

```tsx
import { useTranslation } from 'react-i18next';

export function PatientCard({ patient }: Props) {
  const { t } = useTranslation('patients');

  return (
    <div className="patient-card">
      <h2>{t('patientDetails')}</h2>
      <p>{t('fields.firstName')}: {patient.firstName} {patient.lastName}</p>
      <p>{t('fields.email')}: {patient.email}</p>
      <button>{t('actions.editPatient')}</button>
    </div>
  );
}
```

## 🌐 RTL Support (Future)

For right-to-left languages (Arabic, Hebrew), you'll need to:

1. Add RTL language support in i18n config
2. Add direction detection: `document.dir = i18n.dir()`
3. Update CSS for RTL layouts
4. Test all UI components in RTL mode

## 📚 Resources

- [react-i18next Documentation](https://react.i18next.com/)
- [i18next Documentation](https://www.i18next.com/)
- [Medical Spanish Terminology](https://www.ama-assn.org/delivering-care/population-care/medical-spanish-guide)

## 🤝 Contributing Translations

To contribute translations or fix errors:

1. Locate the appropriate JSON file in `src/i18n/locales/[language]/`
2. Make your changes
3. Test the translations in the UI
4. Submit a pull request with a description of changes

## ⚠️ Important Notes

- **Medical accuracy**: Spanish medical terms have been reviewed for accuracy
- **Character limits**: Some UI components have character limits; test with longer translations
- **Formality**: Spanish translations use formal "usted" form appropriate for medical settings
- **Currency**: Currently uses USD; implement locale-specific currency formatting as needed
