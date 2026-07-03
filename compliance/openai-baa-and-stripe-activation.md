# OpenAI BAA And Stripe Activation

Last updated: 2026-07-03

## OpenAI BAA request

OpenAI's API BAA process starts by emailing `baa@openai.com`. ChatGPT/Codex HIPAA support is not a standalone Codex checkbox; it requires an eligible ChatGPT Enterprise, Healthcare, or Regulated Workspace. OpenAI states that Codex Local support for PHI-covered work must be enabled by the OpenAI account director.

Do not process PHI through Codex, ChatGPT, browser connectors, file uploads, or data migration tools until the BAA is signed and the covered workspace/API configuration is confirmed.

### Email draft

To: `baa@openai.com`

Subject: Business Associate Agreement request for Perry Software LLC

Body:

Hello OpenAI team,

Perry Software LLC is requesting a Business Associate Agreement for OpenAI services.

Company: Perry Software LLC
Use case: We build and operate healthcare practice management and EMR-adjacent software for dermatology and related specialties. We want to use OpenAI services for HIPAA-compliant workflows, including coding assistance, data migration planning, clinical workflow automation, and customer support workflows where protected health information may be involved only after the BAA is complete and the workspace/API configuration is approved.
Requested coverage: OpenAI API services and ChatGPT Enterprise / Healthcare or Regulated Workspace functionality, including Codex Local support where available under the BAA.
Primary contact: Daniel Perry
Email: dan@perrysoftwarellc.com

Please send the BAA process, any required account or company details, and the correct path for enabling Codex HIPAA support for our workspace.

Thank you,
Daniel Perry
Perry Software LLC

## Stripe activation for Perry Software CRM billing

The CRM invoice checkout code is deployed. Real checkout requires these Railway variables on the `derm-api` service in both `production` and `pilot-live`:

```text
CRM_STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
CRM_ACCOUNT_PORTAL_URL=https://perrysoftwarellc.com/account/
CRM_CHECKOUT_ALLOWED_HOSTS=perrysoftwarellc.com,www.perrysoftwarellc.com
```

`CRM_STRIPE_SECRET_KEY` is preferred for Perry Software's own CRM billing so it can be separated from any practice-owned Stripe configuration inside the dermatology app.

Create Stripe webhook endpoints for the live and pilot API services:

```text
https://derm-api-production.up.railway.app/api/stripe/webhook
https://derm-api-pilot-live.up.railway.app/api/stripe/webhook
```

Subscribe the endpoints to:

```text
checkout.session.completed
payment_intent.succeeded
```

Copy each endpoint signing secret, which starts with `whsec_`, into the matching Railway environment as `STRIPE_WEBHOOK_SECRET`.

After the variables are set, redeploy or restart `derm-api` in both Railway environments, then create a CRM invoice with a non-zero open balance and click **Pay with Stripe** from `https://perrysoftwarellc.com/account/`.

## Verification checklist

- `https://perrysoftwarellc.com/account/` loads over HTTPS.
- GitHub Pages has HTTPS enforced.
- Railway `derm-api` has `CRM_STRIPE_SECRET_KEY` or `STRIPE_SECRET_KEY`.
- Railway `derm-api` has `STRIPE_WEBHOOK_SECRET`.
- Stripe webhook endpoints point to both Railway API environments.
- Test payment redirects to Stripe Checkout.
- Stripe `checkout.session.completed` or `payment_intent.succeeded` webhook marks the CRM invoice paid.
