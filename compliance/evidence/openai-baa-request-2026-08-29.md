# OpenAI API BAA Request Evidence

Request sent: 2026-08-29T02:10:19Z

The API organization owner sent a BAA request to `baa@openai.com` and copied `perrysoftwarellc@gmail.com`, following OpenAI's published API BAA process.

- Company: Perry Software LLC
- API organization: `org-j77W6L5lwWAkHLIDvKYySq9q`
- Subject: `HIPAA BAA request — Perry Software / Dermatology EHR API organization`
- Requested scope: eligible OpenAI API services and the organization-level data controls required for optional clinical-assistant and note-drafting workflows
- Safety statement: no patient data is currently in production and no PHI will be sent until the Business Associate and Healthcare Addendum, eligible endpoint/model scope, and exact organization provisioning are complete and independently verified

Gmail displayed `Message sent`. The request itself is not an executed BAA and does not authorize PHI. Retain OpenAI's response and any executed agreement in the approved confidential contract repository; record only a non-confidential artifact reference here.

On 2026-08-29, the API organization owner reviewed **Settings → Organization → Data controls → Data retention** for organization `org-j77W6L5lwWAkHLIDvKYySq9q` and changed optional dashboard API-call logging from `Enabled per call` to `Disabled`. The dashboard displayed `Organization updated successfully`. This is an interim data-minimization control only; it is not Zero Data Retention, Modified Abuse Monitoring, Eyes Off, or Safety Retention, and it does not replace the pending agreement or provisioning approval.

The API-owner inbox was checked again on 2026-08-31. No response to the BAA request was present in either configured Gmail account, so `OPENAI_BAA_ENABLED` must remain unset while the response and provisioning are pending.

## Current activation interpretation

OpenAI's official data-control documentation reviewed on 2026-08-31 says default abuse-monitoring logs can retain customer content for up to 30 days. It describes Zero Data Retention and Modified Abuse Monitoring as prior-approval controls, and separately states that customers with an executed OpenAI Business Associate and Healthcare Addendum may process PHI on BAA-eligible endpoints after the exact organization is provisioned with Eyes Off or Safety Retention. The endpoint table currently lists `/v1/chat/completions` as eligible for Zero Data Retention and Eyes Off/Safety Retention, while `/v1/audio/transcriptions` is listed as Zero Data Retention eligible but not Eyes Off/Safety Retention eligible.

Therefore an email acknowledgement or a generic BAA statement is insufficient. Before activation, retain evidence for the exact organization, endpoints, models, and applicable retention/human-review control. The application now requires explicit endpoint/model allowlists in addition to `OPENAI_BAA_ENABLED`; OpenAI raw audio has a separate disabled-by-default gate and is not needed because AWS HealthScribe is the intended production scribe.

- [OpenAI BAA request process](https://help.openai.com/en/articles/8660679-how-can-i-get-a-business-associate-agreement-baa-with-openai/)

- [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data)
