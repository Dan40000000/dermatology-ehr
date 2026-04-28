# Dermatology Program Retest Checklist

## Demo Login
- Staff admin:
  - Email: `admin@demo.practice`
  - Password: `Password123!`
- Patient portal scheduling test:
  - Email: `daniel.perry@email.com`
  - Password: `Patient123!`
  - Public website booking URL: `http://localhost:5173/book-appointment?tenantId=tenant-demo`
  - Portal booking URL: `http://localhost:5173/portal/book-appointment`

## Seeded Retest Appointments For Today
- `Emily Rodriguez` -> Follow Up
  - ID: `appt-retest-emily-followup`
  - Provider: `Dr. David Skin, MD, FAAD`
  - Time: `16:00Z-16:20Z`
- `Jamie Patient` -> Follow Up
  - ID: `appt-retest-jamie-balance`
  - Provider: `Dr. David Skin, MD, FAAD`
  - Time: `16:30Z-16:50Z`
- `Sarah Johnson` -> Cosmetic Consultation
  - ID: `appt-retest-sarah-cosmetic-consult`
  - Provider: `Sarah Mitchell, PA-C`
  - Time: `17:00Z-17:30Z`
- `Daniel Baker` -> Hydrafacial
  - ID: `appt-retest-daniel-hydrafacial`
  - Provider: `Sarah Mitchell, PA-C`
  - Time: `17:45Z-18:30Z`
- `Tyler Anderson` -> Suspicious Lesion Biopsy
  - ID: `appt-retest-karen-biopsy`
  - Provider: `Dr. Maria Martinez, MD, FAAD`
  - Time: `18:00Z-18:30Z`
- `Emma Clark` -> Melanoma Check/Follow-up
  - ID: `appt-retest-emma-melanoma`
  - Provider: `Dr. Maria Martinez, MD, FAAD`
  - Time: `18:40Z-19:10Z`
- `Stephanie Nelson` -> Microneedling
  - ID: `appt-retest-stephanie-microneedling`
  - Provider: `Sarah Mitchell, PA-C`
  - Time: `19:15Z-20:15Z`

## 1. Patient Portal And Website Scheduling
1. Open `http://localhost:5173/book-appointment?tenantId=tenant-demo`.
2. Confirm the page offers:
   - `Existing Patient Sign In`
   - `Create Portal Account`
3. Sign in as `daniel.perry@email.com`.
4. Confirm you land in booking, not the portal dashboard.
5. Confirm providers load.
6. Confirm appointment types load.
7. Pick a provider, date, and time.
8. Book an appointment successfully.
9. Verify the new appointment appears on:
   - patient portal appointments
   - staff schedule

## 2. Front Desk And Payments
1. Log in as `admin@demo.practice`.
2. Open `Schedule`.
3. Check in `Emily Rodriguez`.
4. Confirm copay / past-due collection flow works.
5. Check in `Jamie Patient`.
6. Confirm past-due-only balance collection works.
7. Confirm receipt / confirmation behavior is correct.

## 3. Clinical Workflow
1. Open `Sarah Johnson`.
2. Start a cosmetic encounter.
3. Add cosmetic procedures from grouped procedure picker.
4. Confirm cosmetic procedures do not require diagnosis linking.
5. Open `Tyler Anderson`.
6. Add a biopsy order.
7. Confirm the order saves.
8. Open `Emma Clark`.
9. Add a body marker.
10. Confirm marker save works.

## 4. Communications
1. Open `Text Messages`.
2. Confirm duplicate/shared-number junk rows are gone.
3. Use `Daniel Perry`.
4. Simulate inbound replies for:
   - billing
   - scheduling
   - refill
5. Confirm routing/group assignment updates correctly.
6. Open `Mail`.
7. Confirm inbox/sent/compose loads without thread errors.

## 5. Finance And Inventory
1. Open `Financials`.
2. Confirm daily / weekly / monthly snapshot cards render.
3. Confirm completed visit activity affects revenue reporting.
4. Open `Inventory`.
5. Confirm list, stats, and item pages load.

## 6. Downtime Packet
1. Open `Admin > Facilities`.
2. Confirm downtime packet settings are available.
3. Open `Schedule`.
4. Confirm the downtime packet action is visible for enabled locations.

## Known External Limits
- Real external SMS delivery is still vendor-blocked until Twilio A2P approval completes.
- Production insurance and live eRx still require a real medical practice identity and vendor onboarding.
- Wispr still requires vendor API access.
