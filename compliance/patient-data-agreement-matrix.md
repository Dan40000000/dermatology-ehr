# Patient Data Agreement Matrix

Last reviewed: 2026-08-28

Status: **NOT APPROVED FOR LIVE PHI**

This is an engineering and compliance-readiness checklist, not legal advice. The privacy officer, security officer, customer/practice representative, and healthcare counsel must approve the final contract map and operating model before live patient data is entered.

## Agreements required before live PHI

| Relationship or capability | Agreement / approval | Current gate |
| --- | --- | --- |
| Each customer practice or other covered entity using the hosted EHR | Executed Business Associate Agreement (BAA) between the practice and Perry Software, plus the services agreement and permitted-use instructions | Missing evidence; do not activate a PHI tenant |
| Railway application hosting and managed PostgreSQL | Railway BAA covering the exact production account, project, services, logs, volumes, and database | Missing evidence; no hosted PHI |
| AWS storage, backup, KMS, email, and voice services | AWS BAA accepted for the production account; each enabled service must be on AWS's HIPAA-eligible services list and configured within the shared-responsibility controls | AWS BAA active for account `213598696247`; S3, KMS, and AWS Transcribe including HealthScribe eligibility verified. Application cleanup deployment, backup restore evidence, least-privilege IAM, MFA, and logging remain shared-responsibility controls. |
| Twilio SMS | Twilio BAA and use of only HIPAA-eligible products in the covered account/project | Missing evidence; keep patient SMS disabled |
| Stedi eligibility, claims, ERA/EFT, or clearinghouse traffic | Stedi BAA, production account approval, payer enrollment, and applicable trading-partner agreements | Missing evidence; keep live transactions disabled |
| OpenAI API receiving clinical text, images, audio, or identifiers | OpenAI BAA, Modified Retention approval, and eligible API endpoint/configuration evidence | Missing evidence; keep PHI-capable AI features disabled or use rigorously de-identified data only |
| Sentry or another error-monitoring vendor | BAA if the service can receive PHI; otherwise an approved, tested, and monitored no-PHI telemetry boundary | Missing evidence; code redaction alone is not contractual evidence |
| Phaxio fax | Phaxio BAA and documented HIPAA account settings, 2FA, HTTPS webhooks, and storage choice | Missing evidence; keep live fax disabled |
| Transactional email provider | BAA if message bodies, attachments, routing, or metadata may contain PHI; otherwise an approved content-free portal-notification policy | Missing provider and evidence |
| E-prescribing and prior-authorization vendors | Vendor services agreement/BAA as applicable, production certification, identity proofing, and EPCS controls if controlled substances are enabled | Missing active production vendor |

The EHR operator must also maintain written subcontractor assurances and flow equivalent privacy/security obligations to any subcontractor that creates, receives, maintains, or transmits ePHI.

## Items that are not automatically BAAs

- Stripe may fall under HIPAA's ordinary payment-processing exception when it performs only a consumer-authorized payment transaction. Keep all diagnosis, MRN, insurance, encounter, and clinical information out of Stripe metadata and have counsel confirm the implemented flow.
- GitHub/CI does not need a BAA only if no PHI, production database dumps, patient screenshots, or PHI-bearing logs enter repositories, issues, artifacts, or job output.
- DNS, static-site, and edge providers do not need a BAA only when they do not create, receive, maintain, or transmit PHI. Reassess if they terminate TLS, cache authenticated pages, or log PHI-bearing URLs/headers.
- Workforce confidentiality acknowledgements, HIPAA training records, incident-response assignments, and security policies are required operating evidence, but they are not substitutes for BAAs.

## Activation evidence required

For every applicable row in `evidence/vendor-baa-inventory.csv`:

1. Record `ACTIVE` or `VERIFIED` only after a named reviewer confirms the signed agreement covers the exact production account and product surface.
2. Put an internal contract/vault/ticket reference in `artifact_link`; do not commit confidential agreement contents to the repository.
3. Record the service configuration, responsible owner, renewal/termination process, breach-notification contact, data-return/deletion terms, and subcontractor list.
4. Run the strict readiness and integration gates using the actual production configuration.
5. Obtain written go-live approval from the practice, privacy officer, security officer, and counsel.

Until those steps are complete, production may contain synthetic test data only.

## Authoritative references

- [HHS Business Associate guidance](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/business-associates/index.html)
- [HHS cloud computing guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html)
- [HHS Security Rule summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html)
- [Railway committed-spend and BAA documentation](https://docs.railway.com/pricing/committed-spend)
- [AWS Artifact BAA documentation](https://aws.amazon.com/artifact/faq/)
- [AWS HIPAA-eligible services reference](https://aws.amazon.com/id/compliance/hipaa-eligible-services-reference/)
- [Twilio HIPAA-eligible products and BAA](https://www.twilio.com/en-us/hipaa)
- [Stedi BAA documentation](https://www.stedi.com/docs/legal/BAA)
- [OpenAI BAA process](https://help.openai.com/en/articles/8660679)
- [OpenAI eligible healthcare and regulated functionality](https://help.openai.com/en/articles/20001069-chatgpt-healthcare-and-regulated-workspace-functionality.csv)
- [Phaxio HIPAA configuration](https://www.phaxio.com/docs/security/hipaa)
