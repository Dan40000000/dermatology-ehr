# Laboratory Integration - Quick Start Guide

## Setup and Testing

### 1. Run Database Migrations

```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend

# Run the migrations
npm run migrate
```

This will create:
- 14 new tables for laboratory integration
- 50+ indexes for performance
- Seed data with 30+ dermatology tests
- 10 pre-configured order sets
- 5 lab vendors (Quest, LabCorp, local pathology labs)

### 2. Start Backend Server

```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend
npm run dev
```

Backend will be available at `http://localhost:3000`

### 3. Start Frontend

```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/frontend
npm run dev
```

Frontend will be available at `http://localhost:5173`

---

## Quick Testing Guide

### Test 1: View Lab Vendors and Test Catalog

**API Call:**
```bash
# Get all lab vendors
curl -X GET http://localhost:3000/api/lab-vendors \
  --cookie "session=YOUR_SESSION_COOKIE"

# Get test catalog
curl -X GET http://localhost:3000/api/lab-vendors/catalog \
  --cookie "session=YOUR_SESSION_COOKIE"

# Get order sets
curl -X GET http://localhost:3000/api/lab-vendors/order-sets \
  --cookie "session=YOUR_SESSION_COOKIE"
```

**Expected Response:**
```json
{
  "vendors": [
    {
      "id": "uuid",
      "name": "Quest Diagnostics",
      "vendor_type": "quest",
      "hl7_enabled": true
    }
  ]
}
```

### Test 2: Create a Lab Order

**API Call:**
```bash
curl -X POST http://localhost:3000/api/lab-orders \
  -H "Content-Type: application/json" \
  --cookie "session=YOUR_SESSION_COOKIE" \
  -d '{
    "patient_id": "PATIENT_UUID",
    "ordering_provider_id": "PROVIDER_UUID",
    "vendor_id": "VENDOR_UUID",
    "order_set_id": "ORDER_SET_UUID",
    "icd10_codes": ["L40.0"],
    "clinical_indication": "Baseline labs before starting biologic",
    "priority": "routine"
  }'
```

**Expected Response:**
```json
{
  "id": "uuid",
  "patient_id": "uuid",
  "status": "pending",
  "tests": [
    {"test_code": "CBC", "test_name": "Complete Blood Count"},
    {"test_code": "CMP", "test_name": "Comprehensive Metabolic Panel"}
  ]
}
```

### Test 3: Submit Order Electronically (Generates HL7)

**API Call:**
```bash
curl -X POST http://localhost:3000/api/lab-orders/ORDER_UUID/submit \
  -H "Content-Type: application/json" \
  --cookie "session=YOUR_SESSION_COOKIE"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Lab order submitted successfully",
  "hl7_message": "MSH|^~\\&|EHR|Clinic|LAB|Laboratory|...",
  "acknowledgment": "MSA|AA|..."
}
```

**Check the HL7 Message:**
The response will include a complete HL7 ORM^O01 message like:
```
MSH|^~\&|default^Dermatology Clinic|LAB^Laboratory|20250129103000||ORM^O01|uuid|P|2.5.1
PID|1|12345|uuid||Doe^John||19800515|M
PV1|1|O
ORC|NW|order-id|order-id
OBR|1|order-id||CBC^Complete Blood Count|||||20250129103000
```

### Test 4: Ingest Lab Results (Mock)

**API Call:**
```bash
curl -X POST http://localhost:3000/api/lab-results/ingest \
  -H "Content-Type: application/json" \
  --cookie "session=YOUR_SESSION_COOKIE" \
  -d '{
    "manual_results": {
      "lab_order_id": "ORDER_UUID",
      "results": [
        {
          "testCode": "WBC",
          "testName": "White Blood Cell Count",
          "value": "7.5",
          "units": "K/uL",
          "referenceRange": "4.0-11.0",
          "resultStatus": "final"
        },
        {
          "testCode": "GLUC",
          "testName": "Glucose",
          "value": "95",
          "units": "mg/dL",
          "referenceRange": "70-100",
          "resultStatus": "final"
        }
      ]
    }
  }'
```

**Expected Response:**
```json
{
  "message": "Results ingested successfully",
  "count": 2,
  "results": [...]
}
```

### Test 5: View Results with Trends

**API Call:**
```bash
# Get all results
curl -X GET http://localhost:3000/api/lab-results \
  --cookie "session=YOUR_SESSION_COOKIE"

# Get trend data for specific test
curl -X GET http://localhost:3000/api/lab-results/trends/PATIENT_UUID/CBC \
  --cookie "session=YOUR_SESSION_COOKIE"
```

**Expected Response (Trends):**
```json
{
  "test_code": "CBC",
  "test_name": "Complete Blood Count",
  "unit": "K/uL",
  "reference_range": {
    "low": 4.0,
    "high": 11.0
  },
  "results": [
    {
      "result_date": "2024-12-01",
      "result_value_numeric": 7.5,
      "is_abnormal": false
    }
  ],
  "statistics": {
    "count": 5,
    "mean": "7.3",
    "min": 6.8,
    "max": 7.9,
    "latest": 7.5
  }
}
```

### Test 6: Create Critical Value and Test Notification

**API Call:**
```bash
# Ingest a critical result
curl -X POST http://localhost:3000/api/lab-results/ingest \
  -H "Content-Type: application/json" \
  --cookie "session=YOUR_SESSION_COOKIE" \
  -d '{
    "manual_results": {
      "lab_order_id": "ORDER_UUID",
      "results": [
        {
          "testCode": "K",
          "testName": "Potassium",
          "value": "6.8",
          "units": "mmol/L",
          "referenceRange": "3.5-5.0",
          "abnormalFlags": "HH",
          "resultStatus": "final"
        }
      ]
    }
  }'

# Get critical notifications
curl -X GET http://localhost:3000/api/lab-results/critical \
  --cookie "session=YOUR_SESSION_COOKIE"

# Acknowledge critical value
curl -X POST http://localhost:3000/api/lab-results/critical/NOTIFICATION_UUID/acknowledge \
  -H "Content-Type: application/json" \
  --cookie "session=YOUR_SESSION_COOKIE" \
  -d '{
    "notification_method": "phone",
    "read_back_value": "Potassium 6.8 mmol/L",
    "action_taken": "Patient instructed to go to ED immediately"
  }'
```

### Test 7: Create Dermatopathology Report

**API Call:**
```bash
curl -X POST http://localhost:3000/api/dermpath/reports \
  -H "Content-Type: application/json" \
  --cookie "session=YOUR_SESSION_COOKIE" \
  -d '{
    "lab_order_id": "ORDER_UUID",
    "patient_id": "PATIENT_UUID",
    "accession_number": "S25-12345",
    "report_date": "2025-01-29",
    "pathologist_name": "Dr. Jane Pathologist",
    "pathologist_npi": "1234567890",
    "specimen_site": "Left forearm, 3cm proximal to wrist",
    "specimen_type": "Punch biopsy",
    "specimen_size": "0.4 x 0.3 x 0.2 cm",
    "clinical_history": "65-year-old male with pigmented lesion",
    "gross_description": "Received in formalin, a 0.4 x 0.3 x 0.2 cm tan-pink tissue",
    "microscopic_description": "Sections show epidermis with elongated rete ridges and increased melanin. The dermis shows a proliferation of nevus cells in nests at the dermoepidermal junction.",
    "diagnosis": "Compound melanocytic nevus, left forearm",
    "margins_status": "clear",
    "status": "final"
  }'
```

### Test 8: Parse Dermatopathology Report

**API Call:**
```bash
curl -X POST http://localhost:3000/api/dermpath/parse \
  -H "Content-Type: application/json" \
  --cookie "session=YOUR_SESSION_COOKIE" \
  -d '{
    "report_text": "ACCESSION: S25-12345\n\nSPECIMEN: Left forearm, punch biopsy\n\nCLINICAL HISTORY: Pigmented lesion\n\nGROSS DESCRIPTION: 0.4cm punch biopsy\n\nMICROSCOPIC DESCRIPTION: Sections show compound melanocytic nevus\n\nDIAGNOSIS: Compound melanocytic nevus"
  }'
```

**Expected Response:**
```json
{
  "parsed": {
    "accessionNumber": "S25-12345",
    "specimenSite": "Left forearm, punch biopsy",
    "diagnosis": "Compound melanocytic nevus",
    ...
  },
  "snomedCode": "254701007",
  "summary": "Punch biopsy from Left forearm showing Compound melanocytic nevus.",
  "keyFindings": []
}
```

---

## Frontend Testing

### Access Pages

1. **Lab Orders Page:**
   - URL: `http://localhost:5173/lab-orders`
   - View all orders
   - Create new orders
   - Submit orders electronically
   - Track specimen status

2. **Lab Results Page:**
   - URL: `http://localhost:5173/lab-results`
   - View all results
   - Critical value alerts
   - Filter abnormal/critical
   - View trends

3. **Patient Chart:**
   - Navigate to patient
   - Click "Lab Orders" tab
   - Click "Lab Results" tab

---

## Common Test Scenarios

### Scenario 1: Order Biologic Baseline Labs

```
1. Navigate to Lab Orders Page
2. Click "New Lab Order"
3. Select Patient
4. Select Provider
5. Select Lab Vendor: "Quest Diagnostics"
6. Select Order Set: "Biologic Therapy Baseline"
7. Enter Clinical Indication: "Baseline labs before starting dupilumab for atopic dermatitis"
8. Click "Create Lab Order"
9. Order created with CBC, CMP, LFT tests
10. Click "Submit" to generate HL7 message
```

### Scenario 2: Review Abnormal Results

```
1. Navigate to Lab Results Page
2. Filter: "Abnormal Only"
3. See results highlighted in yellow
4. Click result to view details
5. See reference range comparison
6. Click "View Trends"
7. See historical chart with trend line
```

### Scenario 3: Acknowledge Critical Value

```
1. Navigate to Lab Results Page
2. See red alert banner: "1 Critical Value Alert"
3. Review critical result details
4. Click "Acknowledge"
5. Enter notification method: "Phone"
6. Enter read-back value: "Potassium 6.8"
7. Enter action taken: "Patient to ED"
8. Click "Acknowledge"
9. Alert removed from dashboard
```

### Scenario 4: Monthly Isotretinoin Labs

```
1. Create order for patient on Accutane
2. Select Order Set: "Isotretinoin Monthly Monitoring"
3. Tests automatically added: LFT, Lipid Panel
4. Enter indication: "Monthly monitoring while on isotretinoin"
5. Submit order
6. When results return, review for:
   - Liver enzymes elevated?
   - Triglycerides elevated?
   - Cholesterol elevated?
7. Document review
```

### Scenario 5: Skin Biopsy to Dermpath

```
1. Create lab order
2. Select vendor: "Dermatopathology Associates"
3. Select test: "Skin Biopsy - Routine"
4. Enter specimen site: "Right shin, 5cm below knee"
5. Enter clinical indication: "Rule out basal cell carcinoma"
6. Submit order
7. Update specimen tracking when collected
8. When report arrives, create dermpath report
9. View formatted report with margins, stains, diagnosis
```

---

## Database Queries for Testing

### Check Lab Orders

```sql
SELECT
  lo.id,
  p.first_name || ' ' || p.last_name as patient,
  lv.name as vendor,
  lo.status,
  lo.order_date,
  (SELECT COUNT(*) FROM lab_order_tests WHERE lab_order_id = lo.id) as test_count
FROM lab_orders lo
JOIN patients p ON lo.patient_id = p.id
JOIN lab_vendors lv ON lo.vendor_id = lv.id
ORDER BY lo.order_date DESC
LIMIT 10;
```

### Check Lab Results

```sql
SELECT
  lr.test_name,
  lr.result_value,
  lr.result_unit,
  lr.is_abnormal,
  lr.is_critical,
  lr.result_date,
  p.first_name || ' ' || p.last_name as patient
FROM lab_results lr
JOIN patients p ON lr.patient_id = p.id
ORDER BY lr.result_date DESC
LIMIT 10;
```

### Check Critical Notifications

```sql
SELECT
  lcn.test_name,
  lcn.result_value,
  lcn.critical_reason,
  lcn.status,
  lcn.created_at,
  p.first_name || ' ' || p.last_name as patient
FROM lab_critical_notifications lcn
JOIN patients p ON lcn.patient_id = p.id
WHERE lcn.status = 'pending'
ORDER BY lcn.created_at DESC;
```

### Check Dermpath Reports

```sql
SELECT
  dr.accession_number,
  dr.specimen_site,
  dr.diagnosis,
  dr.margins_status,
  dr.report_date,
  p.first_name || ' ' || p.last_name as patient
FROM dermpath_reports dr
JOIN patients p ON dr.patient_id = p.id
ORDER BY dr.report_date DESC
LIMIT 10;
```

---

## Troubleshooting

### Issue: "Failed to fetch lab orders"

**Check:**
1. Backend server running on port 3000
2. User is authenticated (has valid session cookie)
3. Database migrations have been run
4. Check backend logs for errors

**Fix:**
```bash
# Check backend is running
curl http://localhost:3000/health

# Check database connection
psql -d dermatology_ehr -c "SELECT COUNT(*) FROM lab_orders;"

# Re-run migrations if needed
npm run migrate
```

### Issue: "No tests available"

**Check:**
1. Seed data has been loaded
2. Lab vendor is selected
3. User has correct tenant_id

**Fix:**
```bash
# Check if test catalog has data
psql -d dermatology_ehr -c "SELECT COUNT(*) FROM lab_test_catalog;"

# If zero, run seed migration
psql -d dermatology_ehr -f backend/src/db/migrations/015_seed_lab_data.sql
```

### Issue: "HL7 message generation failed"

**Check:**
1. All required fields are present (patient, provider, vendor)
2. Patient has MRN
3. Provider has NPI

**Fix:**
- Ensure patient record has `mrn` field populated
- Ensure provider record has `npi` field populated
- Check backend logs for specific HL7Service errors

### Issue: "Trend data not showing"

**Check:**
1. Patient has multiple results for the same test
2. Results have numeric values (not just text)
3. Time period has results

**Fix:**
- Ensure results have `result_value_numeric` field populated
- Check if patient_id and test_code match
- Try different time period (default is 12 months)

---

## File Locations Reference

**Backend:**
- Routes: `/backend/src/routes/labOrders.ts`, `labResults.ts`, `labVendors.ts`, `dermPath.ts`
- Services: `/backend/src/services/hl7Service.ts`, `dermPathParser.ts`
- Migrations: `/backend/src/db/migrations/014_laboratory_integration.sql`, `015_seed_lab_data.sql`

**Frontend:**
- Pages: `/frontend/src/pages/LabOrdersPage.tsx`, `LabResultsPage.tsx`
- Components: `/frontend/src/components/LabOrderForm.tsx`, `ResultViewer.tsx`, `DermPathViewer.tsx`

**Documentation:**
- Full docs: `/LABORATORY_INTEGRATION_DOCS.md`
- Summary: `/LABORATORY_SYSTEM_SUMMARY.md`
- Quick start: `/LABORATORY_QUICK_START.md` (this file)

---

## Next Steps

1. **Run migrations** to create tables and seed data
2. **Start backend** and verify health endpoint
3. **Start frontend** and login
4. **Create a test order** using one of the pre-configured order sets
5. **Submit the order** to generate HL7 message
6. **Ingest mock results** to test result viewing
7. **Create a critical value** to test notification workflow
8. **View trends** to test visualization
9. **Create a dermpath report** to test specialized features

For detailed API documentation, see `/LABORATORY_INTEGRATION_DOCS.md`

For complete feature list, see `/LABORATORY_SYSTEM_SUMMARY.md`
