# SMS + Automated Call Options (US) - 2026-02-27

## What you asked
- Enable appointment text reminders now
- Add automated bot reminder calls
- Start as close to free as possible for testing

## Fast answer
- **Best overall for this codebase now:** **Twilio** (already integrated in backend)
- **Cheapest clear pay-as-you-go published rates:** **Telnyx**
- **Best no-cost testing mode in this app:** built-in **`is_test_mode=true`** (no live SMS/call charges)

## Vendor comparison (official pages)

| Vendor | SMS (US) | Voice call (US) | Free / trial | Notes |
|---|---:|---:|---|---|
| Twilio | Starts at **$0.0083** per message | Starts at **$0.0140/min** outbound call | Trial account has **$15 trial credit** (non-portable trial number restrictions apply) | Easiest because app already uses Twilio SDK/routes |
| Telnyx | **$0.007** outbound SMS (+ carrier fees) | Starts at **$0.002/min** (US voice, pricing page) | **$10 free account credit** + one free local number trial | Lowest published unit pricing among options reviewed |
| Plivo | Starts at **$0.0055** SMS (pricing page) | Starts at **$0.01/min** US local voice | **$30 free trial credits** + **2 free local US numbers** | Competitive pricing; would require provider abstraction changes in app |
| Vonage | Messaging as low as **$0.00080/message** (global IP) | Voice as low as **$0.01446/min** | Free trial with **€10 credits** | Strong platform; rates vary heavily by channel/route/country |

## Recommended rollout (lowest risk)

1. **Use existing Twilio integration now** for production path.
2. Keep tenant in **SMS test mode** while validating workflows (`sms_settings.is_test_mode=true`).
3. For cheap live pilots, compare Twilio vs Telnyx on your real reminder volume before full cutover.
4. Keep voice reminders disabled by default unless clinic explicitly wants call reminders.

## What is already implemented in code (this update)

- Scheduler now supports free test-mode reminder execution without paid Twilio credentials.
- Automated voice reminder call path added via Twilio Voice API.
- Immediate reminder endpoint now supports channel select:
  - `POST /api/sms/send-reminder/:appointmentId` body `{ "channel": "sms" | "voice" }`
  - `POST /api/sms/send-call-reminder/:appointmentId`
- Runtime channel control:
  - `APPOINTMENT_REMINDER_CHANNEL=sms` (default)
  - `APPOINTMENT_REMINDER_CHANNEL=voice`

## Source links
- Twilio pricing (SMS + Voice): https://www.twilio.com/en-us/pricing
- Twilio trial credit details: https://www.twilio.com/docs/iam/test-credentials
- Twilio number/trial restrictions page: https://www.twilio.com/docs/phone-numbers
- Telnyx free trial credit: https://telnyx.com/pricing
- Telnyx messaging pricing: https://telnyx.com/pricing/messaging
- Telnyx voice pricing: https://telnyx.com/pricing/voice
- Plivo pricing/trial: https://www.plivo.com/pricing/
- Vonage pricing: https://www.vonage.com/communications-apis/pricing/
- Vonage trial credit policy: https://api.support.vonage.com/hc/en-us/articles/204014803-How-can-I-upgrade-my-Vonage-API-account-after-signing-up-for-a-free-trial
