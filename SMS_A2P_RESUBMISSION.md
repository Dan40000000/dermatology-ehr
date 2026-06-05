# SMS A2P 10DLC Resubmission Notes

Current Twilio status checked from the live account:

- Account: active full Twilio account
- Phone number: SMS, MMS, and voice capable
- Messaging Service: configured with Railway production webhooks
- A2P Brand: approved
- A2P Campaign: rejected by Twilio and awaiting resubmission/re-review
- Current rejection code: `30909`
- Current rejection reason: Twilio could not verify the Call to Action / message-flow language
- Live consent page verified:
  - `https://perry-software-site.vercel.app/sms-consent.html`
  - `https://perry-software-site.vercel.app/sms-opt-in-evidence.html`
  - `https://perry-software-site.vercel.app/sms-terms.html`
  - `https://perry-software-site.vercel.app/sms-privacy.html`
  - `http://perrysoftwarellc.com/sms-consent.html`
- Custom-domain HTTPS still needs cleanup: `https://perrysoftwarellc.com/sms-consent.html` currently presents a GitHub Pages wildcard certificate instead of a certificate for `perrysoftwarellc.com`.

## What Was Fixed

The public SMS consent page now makes the opt-in language explicit:

- SMS consent is optional.
- The checkbox is not required.
- Treatment, payment, appointment scheduling, registration, and other office services can continue without SMS consent.
- The submit button says optional SMS preference instead of implying required consent.

The existing failed Twilio A2P campaign should be updated with the corrected optional-consent message flow and resubmitted from Text Messages > Settings > Production Readiness. Keep production live-send controls gated until Twilio returns `VERIFIED`.

## Recommended Campaign Message Flow

Use this wording when resubmitting the A2P campaign:

```text
Patients may optionally opt in to operational SMS messages from Nuvora Health / Perry Software LLC during patient intake, patient portal registration, staff-assisted registration, or the public SMS preference page at https://perry-software-site.vercel.app/sms-consent.html. The SMS checkbox is optional, unchecked by default, and not required to receive treatment, complete registration, schedule an appointment, make a payment, use the patient portal, or receive any other office service.

The public opt-in evidence page at https://perry-software-site.vercel.app/sms-opt-in-evidence.html documents each consent path for reviewers, including the public SMS preference form, patient intake, patient check-in, portal registration, and staff-assisted registration.

The opt-in disclosure states that messages may include appointment reminders, scheduling updates, billing notices, prescription coordination, and care follow-up; message frequency varies; message and data rates may apply; patients can reply HELP for help and STOP to opt out. Patients may also opt in or re-subscribe by texting START or YES to the registered practice messaging number +1 980-737-1319. They receive this auto-reply: "Dermatology DEMO Office: You are opted in for text messages. Msg frequency varies. Msg&data rates may apply. Reply HELP for help, STOP to opt out."

Terms of Service: https://perry-software-site.vercel.app/sms-terms.html
Privacy Policy: https://perry-software-site.vercel.app/sms-privacy.html. The SMS Privacy Policy states that mobile numbers, SMS consent, and opt-in status are not sold, rented, or shared with third parties or affiliates for marketing or promotional purposes.
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
- Confirm `TWILIO_MESSAGING_SERVICE_SID` is set to the registered Messaging Service that contains the practice SMS phone number.
- Send one live test message to an opted-in test patient.
- Confirm Twilio message status transitions to `sent` or `delivered`.
- Confirm the app records the outbound SMS message and delivery status.
- Confirm inbound replies route back into Text Messages / Clinical Inbox.
