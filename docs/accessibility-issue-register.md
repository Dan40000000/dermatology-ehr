# Accessibility Issue Register

These are product-level accessibility risks identified during the ADA/Section 504/Section 1557 review. Each item should be tracked until verified, not treated as legal advice or a substitute for a third-party audit.

GitHub tracker: https://github.com/Dan40000000/dermatology-ehr/issues/4

## Enforcement Pattern Notes

- DOJ settlements against medical providers frequently involve failure to provide effective communication for deaf or hard-of-hearing patients and companions. One example is the Riverside Medical Clinic settlement, where DOJ alleged the clinic did not provide a qualified sign language interpreter or other appropriate auxiliary aid and relied on video remote interpretation that often failed.
- The same enforcement logic applies to operational follow-through: if a practice documents an interpreter, captioning, accessible room, transfer assistance, or service animal need, the product should help the staff act on it instead of merely storing the note.

Source: [DOJ Riverside Medical Clinic settlement announcement](https://www.justice.gov/usao-cdca/pr/riverside-medical-clinic-agrees-settle-allegations-it-violated-federal-law-not).

## A11Y-001: Internal Screens Still Have Known Color Contrast Debt

- Severity: Medium
- Area: authenticated app shell, dashboards, dense operational screens
- Risk: low-contrast labels, badges, or secondary text can block low-vision users and may fail WCAG AA contrast criteria.
- Current mitigation: axe tests run across core internal routes, but `color-contrast` remains disabled for authenticated internal screens until the palette is remediated.
- Required fix: audit and adjust text, badge, disabled, chart, and status colors to meet WCAG AA contrast.

## A11Y-002: Generated Patient Documents Need Formal Accessible Output Review

- Severity: High
- Area: face sheets, statements, patient instructions, consent forms, AVS-style outputs, PDFs
- Risk: inaccessible PDFs or printed-only workflows can block screen reader users and patients needing alternate formats.
- Current mitigation: patient access profile can document large-print/electronic/screen-reader-friendly needs.
- Required fix: verify generated documents are accessible HTML first or tagged/structured PDFs with readable order, headings, labels, and alt text.

## A11Y-003: Telehealth And Captions Need End-To-End Validation

- Severity: High
- Area: telehealth, portal, video visit links
- Risk: video care without captions, keyboard support, or accessible controls can create ADA/Section 1557 exposure.
- Current mitigation: access profile tracks caption needs and telehealth communication support.
- Required fix: validate telehealth vendor or module with keyboard, captions, screen reader labels, focus order, and mobile assistive tech.

## A11Y-004: Kiosk And Signature Flows Need Dedicated Manual Assistive-Tech Testing

- Severity: High
- Area: kiosk verification, consent, signature capture, check-in
- Risk: touch-only, canvas-only, or unlabeled signature workflows can block patients with motor, visual, or cognitive disabilities.
- Current mitigation: automated axe coverage should be extended to kiosk routes.
- Required fix: add keyboard alternative for signature/consent, clear focus states, non-canvas attestation path, and manual VoiceOver/NVDA validation.

## A11Y-005: Accommodation Requests Need Operational Follow-Through

- Severity: High
- Area: clinic implementation
- Risk: documenting an accommodation without staff action can increase liability because the practice has notice of the need.
- Current mitigation: visit-prep checklist appears in chart, scheduling, and check-in.
- Required fix: add task/reminder escalation for interpreter booking, accessible room assignment, equipment prep, and same-day unresolved accommodation warnings.
