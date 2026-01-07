# Patient Portal API Reference

Quick reference guide for all Patient Portal enhancement endpoints.

---

## Authentication

All endpoints require:
- **Header:** `Authorization: Bearer {portalToken}`
- **Header:** `x-tenant-id: {tenantId}`
- **Credentials:** `include` (for Safari compatibility)

---

## Billing & Payment Endpoints

### Get Patient Balance
```
GET /api/patient-portal/billing/balance
```
Returns current balance, total charges, payments, and adjustments.

**Response:**
```json
{
  "totalCharges": 500.00,
  "totalPayments": 250.00,
  "totalAdjustments": 0.00,
  "currentBalance": 250.00,
  "lastPaymentDate": "2024-12-15T10:30:00Z",
  "lastPaymentAmount": 100.00
}
```

### Get Charge History
```
GET /api/patient-portal/billing/charges
```
Returns list of all charges for the patient.

**Response:**
```json
{
  "charges": [
    {
      "id": "uuid",
      "serviceDate": "2024-12-01",
      "description": "Office Visit",
      "amount": 150.00,
      "transactionType": "charge",
      "createdAt": "2024-12-01T14:00:00Z"
    }
  ]
}
```

### List Payment Methods
```
GET /api/patient-portal/billing/payment-methods
```
Returns saved payment methods (cards/ACH).

**Response:**
```json
{
  "paymentMethods": [
    {
      "id": "uuid",
      "paymentType": "credit_card",
      "lastFour": "4242",
      "cardBrand": "visa",
      "cardholderName": "John Doe",
      "expiryMonth": 12,
      "expiryYear": 2025,
      "isDefault": true
    }
  ]
}
```

### Add Payment Method
```
POST /api/patient-portal/billing/payment-methods
```
**Request Body:**
```json
{
  "paymentType": "credit_card",
  "cardNumber": "4242424242424242",
  "cardBrand": "visa",
  "expiryMonth": 12,
  "expiryYear": 2025,
  "cardholderName": "John Doe",
  "billingAddress": {
    "street": "123 Main St",
    "city": "Boston",
    "state": "MA",
    "zip": "02101",
    "country": "US"
  },
  "setAsDefault": false
}
```

**Response:**
```json
{
  "id": "uuid",
  "paymentType": "credit_card",
  "lastFour": "4242",
  "cardBrand": "visa",
  "isDefault": false
}
```

### Delete Payment Method
```
DELETE /api/patient-portal/billing/payment-methods/:id
```
**Response:**
```json
{
  "success": true
}
```

### Make a Payment
```
POST /api/patient-portal/billing/payments
```
**Request Body:**
```json
{
  "amount": 100.00,
  "paymentMethodId": "uuid",
  "chargeIds": ["uuid1", "uuid2"],
  "description": "Copay payment"
}
```

**Alternative (with new card):**
```json
{
  "amount": 100.00,
  "savePaymentMethod": true,
  "newPaymentMethod": {
    "paymentType": "credit_card",
    "cardNumber": "4242424242424242",
    "cardBrand": "visa",
    "expiryMonth": 12,
    "expiryYear": 2025,
    "cardholderName": "John Doe",
    "cvv": "123",
    "billingAddress": {
      "street": "123 Main St",
      "city": "Boston",
      "state": "MA",
      "zip": "02101"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "transactionId": "uuid",
  "receiptNumber": "RCP-12345",
  "receiptUrl": "https://...",
  "amount": 100.00
}
```

### Get Payment History
```
GET /api/patient-portal/billing/payment-history
```
**Response:**
```json
{
  "payments": [
    {
      "id": "uuid",
      "amount": 100.00,
      "currency": "USD",
      "status": "completed",
      "paymentMethodType": "credit_card",
      "receiptNumber": "RCP-12345",
      "receiptUrl": "https://...",
      "createdAt": "2024-12-15T10:30:00Z",
      "completedAt": "2024-12-15T10:30:05Z"
    }
  ]
}
```

### Get Payment Plans
```
GET /api/patient-portal/billing/payment-plans
```
**Response:**
```json
{
  "paymentPlans": [
    {
      "id": "uuid",
      "totalAmount": 500.00,
      "amountPaid": 100.00,
      "installmentAmount": 100.00,
      "installmentFrequency": "monthly",
      "numberOfInstallments": 5,
      "nextPaymentDate": "2025-01-01",
      "status": "active",
      "autoPay": true
    }
  ]
}
```

### Get Payment Plan Installments
```
GET /api/patient-portal/billing/payment-plans/:id/installments
```
**Response:**
```json
{
  "installments": [
    {
      "id": "uuid",
      "installmentNumber": 1,
      "amount": 100.00,
      "dueDate": "2024-12-01",
      "status": "paid",
      "paidAmount": 100.00,
      "paidAt": "2024-11-30T10:00:00Z"
    },
    {
      "installmentNumber": 2,
      "amount": 100.00,
      "dueDate": "2025-01-01",
      "status": "pending"
    }
  ]
}
```

### Get Auto-Pay Status
```
GET /api/patient-portal/billing/autopay
```
**Response:**
```json
{
  "enrolled": true,
  "id": "uuid",
  "paymentMethodId": "uuid",
  "isActive": true,
  "chargeDay": 1,
  "chargeAllBalances": true,
  "notifyBeforeCharge": true,
  "notificationDays": 3,
  "lastChargeDate": "2024-12-01",
  "lastChargeAmount": 100.00,
  "cardBrand": "visa",
  "lastFour": "4242"
}
```

### Enroll in Auto-Pay
```
POST /api/patient-portal/billing/autopay
```
**Request Body:**
```json
{
  "paymentMethodId": "uuid",
  "chargeDay": 1,
  "chargeAllBalances": true,
  "minimumAmount": 10.00,
  "notifyBeforeCharge": true,
  "notificationDays": 3,
  "termsAccepted": true
}
```

**Response:**
```json
{
  "id": "uuid",
  "enrolledAt": "2024-12-15T10:30:00Z"
}
```

### Cancel Auto-Pay
```
DELETE /api/patient-portal/billing/autopay
```
**Response:**
```json
{
  "success": true
}
```

---

## Intake Forms & Consent Endpoints

### Get Assigned Forms
```
GET /api/patient-portal/intake/forms
```
Returns all forms assigned to the patient.

**Response:**
```json
{
  "forms": [
    {
      "assignment_id": "uuid",
      "status": "pending",
      "dueDate": "2024-12-20",
      "template_id": "uuid",
      "name": "New Patient Medical History",
      "description": "Complete before first visit",
      "formType": "medical_history",
      "formSchema": { /* JSON schema */ }
    }
  ]
}
```

### Get Form Details
```
GET /api/patient-portal/intake/forms/:assignmentId
```
**Response:**
```json
{
  "assignment_id": "uuid",
  "status": "in_progress",
  "template_id": "uuid",
  "name": "New Patient Medical History",
  "formSchema": {
    "sections": [
      {
        "title": "Personal Information",
        "fields": [
          {
            "id": "allergies",
            "type": "textarea",
            "label": "List any allergies",
            "required": true
          }
        ]
      }
    ]
  },
  "response_id": "uuid",
  "responseData": { /* saved answers */ }
}
```

### Start Form Response
```
POST /api/patient-portal/intake/forms/:assignmentId/start
```
**Response:**
```json
{
  "responseId": "uuid"
}
```

### Save/Submit Form Response
```
PUT /api/patient-portal/intake/responses/:responseId
```
**Request Body (save draft):**
```json
{
  "responseData": {
    "allergies": "None",
    "current_medications": "Aspirin 81mg daily"
  },
  "submit": false
}
```

**Request Body (submit):**
```json
{
  "responseData": { /* all fields */ },
  "submit": true,
  "signatureData": "data:image/png;base64,..."
}
```

**Response:**
```json
{
  "id": "uuid",
  "status": "submitted"
}
```

### Get Form History
```
GET /api/patient-portal/intake/history
```
**Response:**
```json
{
  "history": [
    {
      "id": "uuid",
      "formName": "Annual Update",
      "formType": "medical_history",
      "submittedAt": "2024-12-01T10:00:00Z",
      "reviewedAt": "2024-12-01T14:00:00Z"
    }
  ]
}
```

### Get Available Consents
```
GET /api/patient-portal/intake/consents
```
**Response:**
```json
{
  "consents": [
    {
      "id": "uuid",
      "title": "HIPAA Authorization",
      "consentType": "hipaa",
      "content": "I acknowledge that...",
      "version": "1.0",
      "requiresSignature": true,
      "requiresWitness": false,
      "isRequired": true
    }
  ]
}
```

### Get Required Consents
```
GET /api/patient-portal/intake/consents/required
```
Returns only consents that patient hasn't signed yet.

**Response:** Same as above, but filtered.

### Sign Consent Form
```
POST /api/patient-portal/intake/consents/:consentId/sign
```
**Request Body:**
```json
{
  "signatureData": "data:image/png;base64,...",
  "signerName": "John Doe",
  "signerRelationship": "self",
  "witnessSignatureData": "data:image/png;base64,...",
  "witnessName": "Jane Smith"
}
```

**Response:**
```json
{
  "id": "uuid",
  "signedAt": "2024-12-15T10:30:00Z"
}
```

### Get Signed Consents
```
GET /api/patient-portal/intake/consents/signed
```
**Response:**
```json
{
  "signedConsents": [
    {
      "id": "uuid",
      "consentTitle": "HIPAA Authorization",
      "consentType": "hipaa",
      "signerName": "John Doe",
      "version": "1.0",
      "signedAt": "2024-12-15T10:30:00Z",
      "isValid": true
    }
  ]
}
```

---

## Check-In Endpoints

### Start Check-In
```
POST /api/patient-portal/intake/checkin
```
**Request Body:**
```json
{
  "appointmentId": "uuid",
  "sessionType": "mobile",
  "deviceType": "iPhone 13"
}
```

**Response:**
```json
{
  "sessionId": "uuid",
  "status": "started",
  "startedAt": "2024-12-15T10:30:00Z"
}
```

### Get Check-In Session
```
GET /api/patient-portal/intake/checkin/:sessionId
```
**Response:**
```json
{
  "id": "uuid",
  "appointmentId": "uuid",
  "status": "in_progress",
  "demographicsConfirmed": true,
  "insuranceVerified": true,
  "formsCompleted": false,
  "copayCollected": false,
  "copayAmount": 25.00,
  "staffNotified": false,
  "startedAt": "2024-12-15T10:30:00Z"
}
```

### Update Check-In Progress
```
PUT /api/patient-portal/intake/checkin/:sessionId
```
**Request Body:**
```json
{
  "demographicsConfirmed": true,
  "insuranceVerified": true,
  "formsCompleted": true,
  "copayCollected": true,
  "complete": false
}
```

**Complete check-in:**
```json
{
  "complete": true
}
```

**Response:**
```json
{
  "id": "uuid",
  "status": "completed",
  "completedAt": "2024-12-15T10:45:00Z"
}
```

### Upload Insurance Card
```
POST /api/patient-portal/intake/checkin/:sessionId/upload-insurance
```
**Request Body:**
```json
{
  "frontImageUrl": "https://...",
  "backImageUrl": "https://..."
}
```

**Response:**
```json
{
  "success": true
}
```

---

## Error Responses

All endpoints return standard error format:

**400 Bad Request:**
```json
{
  "error": "Invalid input",
  "details": [
    {
      "field": "amount",
      "message": "Amount must be positive"
    }
  ]
}
```

**401 Unauthorized:**
```json
{
  "error": "Unauthorized"
}
```

**404 Not Found:**
```json
{
  "error": "Resource not found"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal server error"
}
```

---

## Rate Limiting

All portal endpoints are rate-limited:
- **Limit:** Configured by `portalLimiter` middleware
- **Response when exceeded:**
  ```json
  {
    "error": "Too many requests"
  }
  ```

---

## TypeScript Usage

Import from `portalApi.ts`:

```typescript
import {
  // Billing
  fetchPortalBalance,
  fetchPortalCharges,
  makePortalPayment,
  addPortalPaymentMethod,
  enrollPortalAutoPay,

  // Intake
  fetchPortalIntakeForms,
  savePortalIntakeResponse,
  signPortalConsent,

  // Check-in
  startPortalCheckin,
  updatePortalCheckinSession,
} from './portalApi';

// Example usage
const balance = await fetchPortalBalance(tenantId, portalToken);
console.log(balance.currentBalance); // 250.00
```

---

## Testing

### Test Payment Card Numbers
- **Visa:** 4242 4242 4242 4242
- **Mastercard:** 5555 5555 5555 4444
- **Amex:** 3782 822463 10005
- **CVV:** Any 3-4 digits
- **Expiry:** Any future date

### Mock Behavior
- Payment success rate: 95%
- Transaction processing delay: 1 second
- Receipt URL auto-generated

---

## Security Notes

1. **Never send real card numbers** - Always tokenize first
2. **Include tenant_id** in all database queries
3. **Validate patient ownership** of all resources
4. **Log all sensitive actions** with IP address
5. **Use HTTPS only** in production

---

## Complete API Function List (35 total)

### Billing (13)
1. `fetchPortalBalance`
2. `fetchPortalCharges`
3. `fetchPortalPaymentMethods`
4. `addPortalPaymentMethod`
5. `deletePortalPaymentMethod`
6. `makePortalPayment`
7. `fetchPortalPaymentHistory`
8. `fetchPortalPaymentPlans`
9. `fetchPortalPaymentPlanInstallments`
10. `fetchPortalAutoPay`
11. `enrollPortalAutoPay`
12. `cancelPortalAutoPay`

### Intake Forms (6)
13. `fetchPortalIntakeForms`
14. `fetchPortalIntakeForm`
15. `startPortalIntakeForm`
16. `savePortalIntakeResponse`
17. `fetchPortalIntakeHistory`

### Consents (4)
18. `fetchPortalConsents`
19. `fetchPortalRequiredConsents`
20. `signPortalConsent`
21. `fetchPortalSignedConsents`

### Check-In (5)
22. `startPortalCheckin`
23. `fetchPortalCheckinSession`
24. `updatePortalCheckinSession`
25. `uploadPortalInsuranceCard`

All functions include full TypeScript types and Safari compatibility.
