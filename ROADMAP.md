Roadmap & Gap Tracker
=====================

Source inputs: “Open-Source Dermatology EHR vs. Leading EHR Systems – Comparative Analysis and PRD” and MODMED_FEATURE_COMPARISON.md. Goal: reach A+ parity/lead.

Legend: ✅ done, 🚧 in progress, ⏳ planned, 🔴 missing

High Priority (Build Now)
-------------------------
- ✅ Patient portal pre-check-in (start/complete check-in before arrival)
- ✅ Face sheets (printable patient summary from schedule/encounter)
- 🔴 ePA (electronic prior auth) for prescriptions
- 🔴 Fax management (send/receive; queue UI)
- 🔴 Time blocks on schedule (non-patient slots; provider/location aware)
- 🔴 Waitlist with auto-fill/cancel handling and notifications

Medium Priority (V2)
--------------------
- 🔴 Patient handout library (condition/treatment education; assign to patient)
- 🔴 Advanced note management (preliminary/final filters, bulk finalize/assign, include visit code)
- 🔴 Rx workflows: refill denied tracking, change requests, audit confirmation
- 🔴 Direct mail/Direct secure messaging for provider-to-provider
- 🔴 Clearinghouse/ERA/EFT integration (claims submission, remits, reconciliation, closing reports)
- 🔴 Regulatory reporting / CQM (MIPS/quality registry hooks)
- 🔴 Referral contacts network (manage specialists, referral tracking)

Lower Priority / Future
-----------------------
- ⏳ Compliance dashboard (analytics tab)
- ⏳ Portal enhancements: full self-scheduling, bill pay, intake/eCheck-in, family access
- ⏳ Telehealth video UX polish (if needed beyond current)
- ⏳ Ambient AI scribe during live visits (beyond current transcription + drafting)
- ⏳ Mobile-native apps; offline-friendly provider mode
- ⏳ Performance/scale hardening (queues for AI, rate limits per AI endpoint, observability)
- ⏳ Lab/Rad integrations beyond current manual orders; pharmacy network integrations

Status vs MODMED comparison (selected highlights)
-------------------------------------------------
- ✅ Scheduling/office flow/appt flow core
- ✅ Orders/labs/radiology basics; 🔄 missing advanced workflow states (pending plan/unresolved moves)
- ✅ Notes/templates; 🔄 advanced note bulk actions
- ✅ Billing/claims; 🔄 clearinghouse/ERA/closing reports
- ✅ Text messages (advantage)
- ✅ Body diagram & photos (advantage)
- ✅ Patient portal baseline; 🔄 richer self-service/bill pay/intake
- 🔴 ePA; 🔴 Fax; 🔴 Handouts; 🔴 Face sheets; 🔴 Time blocks; 🔴 Waitlist

Next Steps
----------
1) Choose build order for High Priority list (recommend: Time blocks + Waitlist → Face sheets → ePA → Fax).
2) Wire tasks into issue tracker; add acceptance criteria per feature.
3) Add tests (unit/integration) per new module; mock external services (ePA, fax, clearinghouse).
4) Re-run lint/tests after each milestone; add monitoring for new services.
