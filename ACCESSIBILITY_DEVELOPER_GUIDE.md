# Accessibility Developer Quick Guide

**For Developers Working on DermEHR**

This guide provides quick reference information for maintaining and enhancing accessibility in the DermEHR application.

---

## Quick Checklist for New Features

Before committing any new feature, ensure:

- [ ] All interactive elements are keyboard accessible
- [ ] Proper ARIA labels added
- [ ] Color contrast meets 4.5:1 minimum
- [ ] Touch targets are ≥ 44x44px on mobile
- [ ] Form labels properly associated
- [ ] Error messages accessible
- [ ] Focus indicators visible
- [ ] Responsive on mobile (320px - 1920px)
- [ ] Tested with keyboard only
- [ ] Works on mobile device

---

## Common Patterns

### 1. Accessible Button

```tsx
// Good ✅
<button
  type="button"
  onClick={handleClick}
  aria-label="Delete patient record"
  disabled={isLoading}
  aria-busy={isLoading}
>
  {isLoading ? 'Deleting...' : 'Delete'}
</button>

// Bad ❌
<div onClick={handleClick}>Delete</div>
```

### 2. Accessible Form Input

```tsx
// Good ✅
<div className="form-field">
  <label htmlFor="email">
    Email Address
    {required && <span className="required">*</span>}
  </label>
  <input
    id="email"
    type="email"
    value={email}
    onChange={handleChange}
    required={required}
    aria-required={required}
    aria-invalid={hasError}
    aria-describedby={`${hasError ? 'email-error' : ''} email-help`.trim()}
  />
  {helpText && (
    <span id="email-help" className="help-text">{helpText}</span>
  )}
  {hasError && (
    <span id="email-error" className="field-error">{error}</span>
  )}
</div>

// Bad ❌
<input placeholder="Email" />
```

### 3. Accessible Link

```tsx
// Good ✅
<a
  href="/patients/123"
  aria-label="View patient John Doe's record"
>
  View Details
</a>

// External link
<a
  href="https://example.com"
  target="_blank"
  rel="noopener noreferrer"
  aria-label="External resource (opens in new window)"
>
  External Link
</a>

// Bad ❌
<a href="/patients/123">Click here</a>
```

### 4. Accessible Modal

```tsx
// Good ✅
<Modal
  isOpen={isOpen}
  onClose={handleClose}
  title="Confirm Action"
>
  <p>Are you sure you want to delete this record?</p>
  <div className="modal-footer">
    <button onClick={handleClose}>Cancel</button>
    <button onClick={handleConfirm}>Confirm</button>
  </div>
</Modal>

// Modal component already handles:
// - role="dialog"
// - aria-modal="true"
// - aria-labelledby
// - Escape key
// - Focus trap
// - Focus return
```

### 5. Accessible Loading State

```tsx
// Good ✅
<button
  type="button"
  onClick={handleSubmit}
  disabled={isLoading}
  aria-busy={isLoading}
>
  {isLoading ? (
    <>
      <span className="spinner" aria-hidden="true" />
      Loading...
    </>
  ) : (
    'Submit'
  )}
</button>

// Bad ❌
<button disabled={isLoading}>
  {isLoading ? '...' : 'Submit'}
</button>
```

### 6. Accessible Error Message

```tsx
// Good ✅
{error && (
  <div
    role="alert"
    className="alert-error"
    aria-live="polite"
  >
    <strong>Error:</strong> {error}
  </div>
)}

// Bad ❌
{error && <div style={{color: 'red'}}>{error}</div>}
```

### 7. Accessible Table

```tsx
// Good ✅
<table role="table">
  <thead>
    <tr>
      <th scope="col">Patient Name</th>
      <th scope="col">MRN</th>
      <th scope="col">Date of Birth</th>
    </tr>
  </thead>
  <tbody>
    {patients.map((patient) => (
      <tr key={patient.id}>
        <td>{patient.name}</td>
        <td>{patient.mrn}</td>
        <td>{patient.dob}</td>
      </tr>
    ))}
  </tbody>
</table>

// Bad ❌
<div className="table">
  <div className="row">
    <div>Name</div>
    <div>MRN</div>
  </div>
</div>
```

### 8. Accessible Icon Button

```tsx
// Good ✅
<button
  type="button"
  onClick={handleRefresh}
  aria-label="Refresh patient list"
  className="icon-button"
>
  <span aria-hidden="true">⟳</span>
</button>

// Bad ❌
<button onClick={handleRefresh}>⟳</button>
```

### 9. Accessible Navigation

```tsx
// Good ✅
<nav role="navigation" aria-label="Main navigation">
  <NavLink
    to="/home"
    aria-current={isActive ? 'page' : undefined}
  >
    Home
  </NavLink>
  <NavLink to="/patients">Patients</NavLink>
</nav>

// Bad ❌
<div className="nav">
  <a href="/home">Home</a>
</div>
```

### 10. Accessible Status Badge

```tsx
// Good ✅
<span
  className="status-badge status-success"
  role="status"
  aria-label="Status: Active"
>
  Active
</span>

// With count
<span
  role="status"
  aria-label={`${count} unread messages`}
  className="badge"
>
  {count}
</span>

// Bad ❌
<span className="badge">{count}</span>
```

---

## ARIA Attributes Quick Reference

### Essential ARIA Attributes

| Attribute | Use Case | Example |
|-----------|----------|---------|
| `aria-label` | Provide accessible name | `<button aria-label="Close">×</button>` |
| `aria-labelledby` | Reference element(s) for label | `<div role="dialog" aria-labelledby="title">` |
| `aria-describedby` | Additional description | `<input aria-describedby="help-text">` |
| `aria-required` | Required form field | `<input required aria-required="true">` |
| `aria-invalid` | Invalid input | `<input aria-invalid="true">` |
| `aria-live` | Live region | `<div aria-live="polite">` |
| `aria-busy` | Loading state | `<button aria-busy="true">` |
| `aria-haspopup` | Has popup menu | `<button aria-haspopup="menu">` |
| `aria-expanded` | Expanded state | `<button aria-expanded="true">` |
| `aria-current` | Current item | `<a aria-current="page">` |
| `aria-modal` | Modal dialog | `<div role="dialog" aria-modal="true">` |
| `aria-hidden` | Hide from screen readers | `<span aria-hidden="true">⟳</span>` |

### Common Roles

| Role | Use Case | Example |
|------|----------|---------|
| `banner` | Site header | `<header role="banner">` |
| `navigation` | Navigation menu | `<nav role="navigation">` |
| `main` | Main content | `<main role="main">` |
| `contentinfo` | Footer | `<footer role="contentinfo">` |
| `search` | Search form | `<div role="search">` |
| `dialog` | Modal dialog | `<div role="dialog">` |
| `alert` | Alert message | `<div role="alert">` |
| `status` | Status update | `<span role="status">` |
| `button` | Button (if not using `<button>`) | `<div role="button">` |
| `checkbox` | Checkbox (if not using `<input>`) | `<div role="checkbox">` |

---

## Keyboard Navigation

### Required Keyboard Support

| Element | Keys | Behavior |
|---------|------|----------|
| Links/Buttons | `Enter` or `Space` | Activate |
| Modals | `Escape` | Close modal |
| All elements | `Tab` | Navigate forward |
| All elements | `Shift + Tab` | Navigate backward |
| Select | `Arrow Up/Down` | Navigate options |
| Radio group | `Arrow Up/Down` | Navigate options |
| Checkbox | `Space` | Toggle |
| Lists | `Arrow Up/Down` | Navigate items (optional) |

### Testing Keyboard Navigation

```bash
# Test checklist:
1. Can you reach all interactive elements with Tab?
2. Is the tab order logical?
3. Are focus indicators visible?
4. Can you activate elements with Enter/Space?
5. Can you close modals with Escape?
6. Are there any keyboard traps?
```

---

## Color Contrast

### Minimum Requirements

- **Normal text:** 4.5:1 contrast ratio
- **Large text (18pt/24px or 14pt bold):** 3:1 contrast ratio
- **UI components:** 3:1 contrast ratio

### Approved Color Combinations

```css
/* Text on white background */
--gray-900: #111827;  /* 15.3:1 ✅ */
--gray-800: #1f2937;  /* 12.6:1 ✅ */
--gray-700: #374151;  /* 9.7:1 ✅ */
--gray-600: #4b5563;  /* 8.1:1 ✅ */
--gray-500: #6b7280;  /* 4.9:1 ✅ (use gray-600 for body text) */

/* Links */
--primary-700: #0369a1;  /* 5.9:1 ✅ */
--primary-600: #0284c7;  /* 4.6:1 ✅ */

/* Buttons */
--accent-500: #2563eb;  /* White text: 5.8:1 ✅ */

/* Status colors (on light backgrounds) */
--success-600: #059669;  /* 4.8:1 ✅ */
--warning-600: #d97706;  /* 4.6:1 ✅ */
--error-600: #dc2626;    /* 5.2:1 ✅ */
```

### Tools for Testing Contrast

- Chrome DevTools (Lighthouse)
- WebAIM Contrast Checker
- Colour Contrast Analyser

---

## Responsive Design

### Breakpoints

```css
/* Mobile: 320px - 767px */
@media (max-width: 767px) {
  /* Mobile styles */
}

/* Tablet: 768px - 1023px */
@media (min-width: 768px) and (max-width: 1023px) {
  /* Tablet styles */
}

/* Desktop: 1024px+ */
@media (min-width: 1024px) {
  /* Desktop styles */
}
```

### Touch Targets

```css
/* Minimum 44x44px on touch devices */
@media (pointer: coarse) {
  button, a, input, select {
    min-height: 44px;
    min-width: 44px;
  }
}
```

### Responsive Testing

```bash
# Test on these viewport sizes:
- 320px (iPhone SE)
- 375px (iPhone 12/13)
- 414px (iPhone Pro Max)
- 768px (iPad portrait)
- 1024px (iPad landscape)
- 1280px (Desktop)
- 1920px (Full HD)
```

---

## Common Mistakes to Avoid

### ❌ Don't Do This

```tsx
// 1. Missing alt text
<img src="patient-photo.jpg" />

// 2. Div button
<div onClick={handleClick}>Click me</div>

// 3. Missing label
<input placeholder="Email" />

// 4. Click here
<a href="/details">Click here</a>

// 5. Color only
<span style={{color: 'red'}}>Error</span>

// 6. Missing focus indicator
button:focus { outline: none; }

// 7. Small touch targets
<button style={{padding: '2px'}}>X</button>

// 8. Unlabeled icon
<button>🗑️</button>

// 9. Non-semantic structure
<div className="heading">Title</div>

// 10. Keyboard trap
// Modal with no escape key handler
```

### ✅ Do This Instead

```tsx
// 1. Alt text
<img src="patient-photo.jpg" alt="Patient with melanoma on left arm" />

// 2. Semantic button
<button onClick={handleClick}>Click me</button>

// 3. Proper label
<label htmlFor="email">Email</label>
<input id="email" type="email" />

// 4. Descriptive link
<a href="/details">View patient details</a>

// 5. Icon + text
<span role="alert" className="error-message">
  <span aria-hidden="true">⚠</span> Error: Invalid email
</span>

// 6. Visible focus
button:focus-visible {
  outline: 2px solid var(--primary-500);
  outline-offset: 2px;
}

// 7. Adequate touch targets
<button style={{padding: '0.75rem'}}>Close</button>

// 8. Labeled icon
<button aria-label="Delete patient record">🗑️</button>

// 9. Semantic HTML
<h2>Patient Information</h2>

// 10. Escape key support
useEffect(() => {
  const handleEscape = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', handleEscape);
  return () => document.removeEventListener('keydown', handleEscape);
}, []);
```

---

## Testing Tools

### Browser DevTools
- **Chrome Lighthouse:** Accessibility audit
- **Chrome DevTools:** Inspect accessibility tree
- **Firefox Accessibility Inspector:** Detailed ARIA inspection

### Browser Extensions
- **axe DevTools:** Comprehensive accessibility testing
- **WAVE:** Visual feedback about accessibility
- **Accessibility Insights:** Microsoft's testing tool

### Screen Readers
- **NVDA (Windows):** Free, industry standard
- **JAWS (Windows):** Commercial, widely used
- **VoiceOver (macOS/iOS):** Built-in Apple screen reader
- **TalkBack (Android):** Built-in Android screen reader

### Automated Testing
```bash
# Add to package.json
"scripts": {
  "test:a11y": "pa11y-ci --config .pa11yci.json"
}

# Install
npm install --save-dev pa11y-ci
```

---

## Resources

### Standards & Guidelines
- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)

### Testing Tools
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [WAVE Web Accessibility Evaluation Tool](https://wave.webaim.org/)
- [axe DevTools](https://www.deque.com/axe/devtools/)

### Learning Resources
- [A11y Project](https://www.a11yproject.com/)
- [Inclusive Components](https://inclusive-components.design/)
- [Web.dev Accessibility](https://web.dev/accessibility/)

---

## Code Review Checklist

When reviewing PRs, check for:

- [ ] Semantic HTML used
- [ ] ARIA attributes correct
- [ ] Keyboard navigation works
- [ ] Focus indicators visible
- [ ] Color contrast adequate
- [ ] Touch targets sized correctly
- [ ] Form labels associated
- [ ] Error messages accessible
- [ ] Loading states announced
- [ ] Mobile responsive
- [ ] Tested with screen reader
- [ ] No console errors
- [ ] Documentation updated

---

## Quick Commands

```bash
# Run accessibility tests
npm run test:a11y

# Start dev server
npm run dev

# Build for production
npm run build

# Run linter
npm run lint

# Type check
npm run type-check
```

---

## Getting Help

### Internal Resources
- **ACCESSIBILITY_AUDIT.md** - Complete audit report
- **MOBILE_COMPATIBILITY.md** - Mobile testing results
- **ACCESSIBILITY_IMPLEMENTATION_SUMMARY.md** - Implementation overview

### Questions?
- **Email:** dev@mountainpinederm.com
- **Slack:** #accessibility channel

---

## Remember

1. **Accessibility is not optional** - It's a requirement
2. **Test early and often** - Don't wait until the end
3. **Use semantic HTML** - It's accessible by default
4. **Keyboard test everything** - Unplug your mouse
5. **Mobile test on real devices** - Emulators aren't enough
6. **Screen readers are real users** - Test with them
7. **Color isn't enough** - Add icons, text, or patterns
8. **Focus is important** - Never hide it without replacement
9. **Labels are required** - All inputs need labels
10. **When in doubt, ask** - Better to ask than ship inaccessible code

---

**Keep this guide handy when developing new features!**

Last updated: December 29, 2025
