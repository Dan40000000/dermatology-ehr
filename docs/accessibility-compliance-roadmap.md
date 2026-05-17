# Accessibility Compliance Roadmap

This project should be treated as a shared-responsibility healthcare accessibility tool. The product can reduce risk for practices by supporting accessible digital workflows and accommodation documentation, but the practice remains responsible for physical office access, trained staff, interpreters, service animal policies, and site-specific legal compliance.

## Product Baseline

- Target WCAG 2.2 AA for product development.
- Treat WCAG 2.1 AA as the minimum enforceable baseline for healthcare web and mobile workflows that may fall under Section 504 or Section 1557.
- Keep patient-facing flows highest priority: public booking, portal login, intake, consent, bill pay, document sharing, messaging, telehealth, and kiosk check-in.
- Keep operational flows accessible because disabled staff and providers may use the system too: scheduling, patient search, chart review, financials, claims, and clearinghouse work queues.

## Research Basis

- HHS Section 504 web, mobile, and kiosk guidance applies to doctors, dentists, hospitals, clinics, emergency rooms, and other health care providers receiving HHS federal financial assistance, including Medicare and Medicaid funds. Large recipients must conform web content and mobile apps to WCAG 2.1 AA by May 11, 2026; smaller recipients by May 10, 2027. Effective communication and reasonable modification duties already apply.
- HHS Section 1557 guidance ties health program ICT accessibility to Section 504 and separately calls out telehealth nondiscrimination.
- DOJ ADA guidance for medical providers emphasizes full and equal access, reasonable modifications, effective communication, accessible exam rooms, accessible equipment, and trained staff for transfer assistance.
- DOJ ADA effective communication guidance includes auxiliary aids such as qualified interpreters, captioning, relay services, accessible electronic documents, screen reader support, magnification support, and other communication technology.
- DOJ Title III service animal rules limit what a public accommodation may ask and clarify that the handler is responsible for care and control.

Sources: [HHS web/mobile/kiosk requirements](https://www.hhs.gov/sites/default/files/new-requirements-accessibility-web-content-mobile-apps-kiosks.pdf), [HHS Section 504/1557 disability guidance](https://www.hhs.gov/sites/default/files/ocr-dcl-section-504-section-1557-disability.pdf), [ADA medical care mobility guidance](https://www.ada.gov/resources/medical-care-mobility/), [ADA effective communication guidance](https://www.ada.gov/resources/effective-communication/), [ADA Title III regulations](https://www.ada.gov/law-and-regs/regulations/title-iii-regulations/).

## Built-In Support

- Patient records now include a structured `accessibilityProfile` field for communication support, interpreter needs, mobility assistance, accessible room/equipment needs, service animal access, companion communication needs, extra visit time, sensory considerations, and staff notes.
- New patient registration includes an optional Access Needs section.
- Patient charts include an Access Needs tab, an overview visit-prep card, and banner alerts.
- Scheduling displays access-needs badges and appointment-modal prep guidance.
- Check-in review surfaces access-needs prep items before finalizing arrival.
- Automated Playwright axe checks cover login, dashboard, patients, schedule, patient access needs, new patient access needs, and public booking entry.

## Remaining Practice Responsibilities

- Maintain an accessibility policy and accommodation request workflow.
- Train staff on effective communication, service animal access, transfer assistance, and accessible equipment operation.
- Contract or operationalize qualified interpreter services where needed.
- Maintain accessible exam rooms, routes, restrooms, scales, tables, and procedure rooms.
- Keep public website, portal content, PDFs, forms, and telehealth workflows accessible.
- Have counsel review public accessibility statements, SaaS terms, and customer-facing claims before saying "ADA compliant."

## Engineering Guardrails

- New interactive UI must be keyboard operable.
- Form controls need programmatic labels and clear error messaging.
- Modals must trap focus and return focus on close.
- Tables need headers and meaningful row actions.
- Charts need text summaries or data tables.
- Patient documents should be accessible HTML first, with tagged/structured PDFs when PDFs are necessary.
- Do not rely on color alone for status.
- Add accessibility tests when new patient-facing or front-desk workflows are introduced.
