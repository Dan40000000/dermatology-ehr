# SMS A2P 10DLC Resubmission Notes

Current Twilio status checked from the live account:

- Account: active full Twilio account
- Phone number: SMS, MMS, and voice capable
- Messaging Service: configured with Railway production webhooks
- A2P Brand: approved
- A2P Campaign: resubmitted / in progress after fixing the consent flow
- Previous rejection code: `30923`
- Previous rejection reason: consent cannot be a required condition for service or transaction completion
- Live consent page verified:
  - `https://perry-software-site.vercel.app/sms-consent.html`
  - `http://perrysoftwarellc.com/sms-consent.html`
- Custom-domain HTTPS still needs cleanup: `https://perrysoftwarellc.com/sms-consent.html` currently presents a GitHub Pages wildcard certificate instead of a certificate for `perrysoftwarellc.com`.

## What Was Fixed

The public SMS consent page now makes the opt-in language explicit:

- SMS consent is optional.
- The checkbox is not required.
- Treatment, payment, appointment scheduling, registration, and other office services can continue without SMS consent.
- The submit button says optional SMS preference instead of implying required consent.

The existing failed Twilio A2P campaign was updated with the corrected optional-consent message flow and resubmitted. Keep production live-send controls gated until Twilio returns `VERIFIED`.

## Recommended Campaign Message Flow

Use this wording when resubmitting the A2P campaign:

```text
Patients may optionally opt in to operational SMS messages from Nuvora Health / Perry Software LLC during patient intake, patient portal registration, staff-assisted registration, or the public SMS preference page at https://perry-software-site.vercel.app/sms-consent.html. The SMS checkbox is optional, unchecked by default, and not required to receive treatment, complete registration, schedule an appointment, make a payment, or use any other office service.

The opt-in disclosure states that messages may include appointment reminders, scheduling updates, billing notices, prescription coordination, and care follow-up; message frequency varies; message and data rates may apply; patients can reply HELP for help and STOP to opt out. Patients may also text START or YES to the practice messaging number to opt in or re-subscribe after opting out.

Terms of Service: https://perry-software-site.vercel.app/sms-terms.html
Privacy Policy: https://perry-software-site.vercel.app/sms-privacy.html
```

## Recommended Sample Messages

```text
Nuvora Health: Reminder for your dermatology appointment on 05/08 at 2:15 PM. Reply HELP for help or STOP to opt out.
```

```text
Nuvora Health: Your billing statement is ready in the patient portal. Reply HELP for help or STOP to opt out.
```

```text
Nuvora Health: Your refill request was received and is being reviewed by the office. Reply HELP for help or STOP to opt out.
```

## Approval Gate

Do not enable unrestricted production texting until the Twilio campaign status is `VERIFIED`.

After Twilio verifies the campaign:

- Confirm `SMS_LIVE_SEND_ENABLED=true` is set in the production API environment if `NODE_ENV=production`.
- Send one live test message to an opted-in test patient.
- Confirm Twilio message status transitions to `sent` or `delivered`.
- Confirm the app records the outbound SMS message and delivery status.
- Confirm inbound replies route back into Text Messages / Clinical Inbox.
