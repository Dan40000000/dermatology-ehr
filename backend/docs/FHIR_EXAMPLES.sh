#!/bin/bash

# FHIR R4 API Examples
# Comprehensive examples for testing FHIR endpoints

BASE_URL="http://localhost:4000/api/fhir"
TOKEN="demo-fhir-access-token-abcdef123456"

echo "========================================"
echo "FHIR R4 API Examples"
echo "========================================"
echo ""

# 1. Get Capability Statement (no auth required)
echo "1. GET Capability Statement"
echo "curl -X GET $BASE_URL/metadata"
echo ""
curl -X GET "$BASE_URL/metadata" | jq '.'
echo ""
echo "========================================"
echo ""

# 2. Get all Patients
echo "2. GET All Patients"
echo "curl -H 'Authorization: Bearer $TOKEN' $BASE_URL/Patient"
echo ""
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/Patient" | jq '.'
echo ""
echo "========================================"
echo ""

# 3. Get specific Patient
echo "3. GET Specific Patient"
echo "curl -H 'Authorization: Bearer $TOKEN' $BASE_URL/Patient/p-demo"
echo ""
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/Patient/p-demo" | jq '.'
echo ""
echo "========================================"
echo ""

# 4. Search Patients by name
echo "4. Search Patients by Name"
echo "curl -H 'Authorization: Bearer $TOKEN' '$BASE_URL/Patient?name=Jamie'"
echo ""
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/Patient?name=Jamie" | jq '.'
echo ""
echo "========================================"
echo ""

# 5. Get all Practitioners
echo "5. GET All Practitioners"
echo "curl -H 'Authorization: Bearer $TOKEN' $BASE_URL/Practitioner"
echo ""
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/Practitioner" | jq '.'
echo ""
echo "========================================"
echo ""

# 6. Get specific Practitioner
echo "6. GET Specific Practitioner"
echo "curl -H 'Authorization: Bearer $TOKEN' $BASE_URL/Practitioner/prov-demo"
echo ""
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/Practitioner/prov-demo" | jq '.'
echo ""
echo "========================================"
echo ""

# 7. Get all Encounters
echo "7. GET All Encounters"
echo "curl -H 'Authorization: Bearer $TOKEN' $BASE_URL/Encounter"
echo ""
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/Encounter" | jq '.'
echo ""
echo "========================================"
echo ""

# 8. Search Encounters by patient
echo "8. Search Encounters by Patient"
echo "curl -H 'Authorization: Bearer $TOKEN' '$BASE_URL/Encounter?patient=p-demo'"
echo ""
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/Encounter?patient=p-demo" | jq '.'
echo ""
echo "========================================"
echo ""

# 9. Get all Observations (Vitals)
echo "9. GET All Observations"
echo "curl -H 'Authorization: Bearer $TOKEN' $BASE_URL/Observation"
echo ""
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/Observation" | jq '.'
echo ""
echo "========================================"
echo ""

# 10. Search Observations by patient
echo "10. Search Observations by Patient"
echo "curl -H 'Authorization: Bearer $TOKEN' '$BASE_URL/Observation?patient=p-demo'"
echo ""
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/Observation?patient=p-demo" | jq '.'
echo ""
echo "========================================"
echo ""

# 11. Get all Conditions (Diagnoses)
echo "11. GET All Conditions"
echo "curl -H 'Authorization: Bearer $TOKEN' $BASE_URL/Condition"
echo ""
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/Condition" | jq '.'
echo ""
echo "========================================"
echo ""

# 12. Get all Procedures (Charges/CPT)
echo "12. GET All Procedures"
echo "curl -H 'Authorization: Bearer $TOKEN' $BASE_URL/Procedure"
echo ""
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/Procedure" | jq '.'
echo ""
echo "========================================"
echo ""

# 13. Get all Appointments
echo "13. GET All Appointments"
echo "curl -H 'Authorization: Bearer $TOKEN' $BASE_URL/Appointment"
echo ""
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/Appointment" | jq '.'
echo ""
echo "========================================"
echo ""

# 14. Search Appointments by patient
echo "14. Search Appointments by Patient"
echo "curl -H 'Authorization: Bearer $TOKEN' '$BASE_URL/Appointment?patient=p-demo'"
echo ""
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/Appointment?patient=p-demo" | jq '.'
echo ""
echo "========================================"
echo ""

# 15. Get all Organizations
echo "15. GET All Organizations"
echo "curl -H 'Authorization: Bearer $TOKEN' $BASE_URL/Organization"
echo ""
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/Organization" | jq '.'
echo ""
echo "========================================"
echo ""

# 16. Get Bundle Summary
echo "16. GET Bundle Summary"
echo "curl -H 'Authorization: Bearer $TOKEN' $BASE_URL/Bundle/summary"
echo ""
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/Bundle/summary" | jq '.'
echo ""
echo "========================================"
echo ""

# 17. Test Error - Invalid Token
echo "17. Test Error - Invalid Token"
echo "curl -H 'Authorization: Bearer invalid-token' $BASE_URL/Patient"
echo ""
curl -H "Authorization: Bearer invalid-token" "$BASE_URL/Patient" | jq '.'
echo ""
echo "========================================"
echo ""

# 18. Test Error - Missing Token
echo "18. Test Error - Missing Token"
echo "curl $BASE_URL/Patient"
echo ""
curl "$BASE_URL/Patient" | jq '.'
echo ""
echo "========================================"
echo ""

# 19. Pagination Example
echo "19. Pagination Example"
echo "curl -H 'Authorization: Bearer $TOKEN' '$BASE_URL/Patient?_count=5&_offset=0'"
echo ""
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/Patient?_count=5&_offset=0" | jq '.'
echo ""
echo "========================================"
echo ""

echo "All examples completed!"
