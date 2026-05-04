# Billing Charge-Code Model

This app now treats encounter billing as charge-code driven:

- `ICD-10-CM` is the diagnosis code set used to justify medical necessity.
- `CPT` and `HCPCS Level II` are the service/procedure/supply code sets used for insurance-routed charges.
- Practice dollars come from fee schedules and payer contracts, not from the code alone.
- Cosmetic/self-pay services use internal practice codes and the cosmetic fee schedule by default.

## Source Boundary

Full CPT content is AMA-owned/licensed. The app should not scrape or ship a complete CPT database unless the practice has a licensed source. The local seed is a small dermatology starter catalog with generic descriptions and demo fees so the system can be tested.

Official sources to use when moving beyond the demo catalog:

- CDC/NCHS ICD-10-CM browser and files for diagnosis codes.
- CMS HCPCS Level II files for public HCPCS codes.
- CMS Physician Fee Schedule public use files for Medicare RVU/payment reference.
- AMA or licensed distributor for full CPT content and official descriptors.

## Charge Routing

Insurance-routed line:

- `code_type`: `CPT` or `HCPCS`
- `billing_route`: `insurance`
- Requires linked ICD-10 diagnosis before claim generation.
- Flows into claims, bills, financial dashboards, and patient responsibility estimates.

Patient-responsible line:

- `code_type`: usually `INTERNAL`
- `billing_route`: `self_pay`
- Diagnosis link optional.
- Does not become an insurance claim line by default.
- Still flows to patient balance and financial revenue.

Examples:

- `17311`, `17312`: Mohs surgery insurance-routed CPT starter lines.
- `11102`, `11104`: biopsy insurance-routed CPT starter lines.
- `J3301`: HCPCS medication/supply starter line.
- `LHR-MED`, `BOTOXUNIT`, `FILLERSYR`: internal self-pay services.

## Current Mohs Demo Validation

The local demo fee schedule is intentionally aligned to the provided billing reference image:

- `17311`: `$1,367.00`, insurance-routed, ICD-10 diagnosis required.
- `17312`: `$803.00`, insurance-routed, ICD-10 diagnosis required.
- `C44.41`: Basal cell carcinoma of skin of scalp and neck, available in diagnosis search.

In that image, `C44.41` is the ICD-10 diagnosis used on the charge lines. The gray `(173.41)` display is an old ICD-9 crosswalk/reference label, not the CPT service code and not the ICD-10 code this app should attach to new billing lines.

To validate pricing for real billing, compare each app fee schedule row against the practice's approved fee schedule or payer contract. CPT/HCPCS identifies the service, but it does not by itself define the practice charge or the payer-allowed amount.

## Live Practice Notes

Before live billing, replace or augment the starter catalog with licensed CPT content, payer fee schedules, provider-specific contracts, NCCI/modifier rules, LCD/NCD coverage checks, and clearinghouse validation.
