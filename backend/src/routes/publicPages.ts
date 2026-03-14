import { Router } from "express";

const publicPagesRouter = Router();

const practiceName = process.env.MESSAGING_FROM_NAME || process.env.FROM_NAME || "Mountain Pine Dermatology";
const supportPhone = process.env.MESSAGING_SUPPORT_PHONE || "+1 (980) 737-1319";
const supportEmail = process.env.MESSAGING_SUPPORT_EMAIL || "support@testmedical.com";

function renderPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f7fb;
        --card: #ffffff;
        --text: #122033;
        --muted: #54657d;
        --line: #d7e0ea;
        --accent: #0b84c6;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: linear-gradient(180deg, #f7fbff 0%, var(--bg) 100%);
        color: var(--text);
      }
      main {
        max-width: 900px;
        margin: 0 auto;
        padding: 40px 20px 80px;
      }
      .card {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 32px;
        box-shadow: 0 18px 50px rgba(15, 40, 80, 0.08);
      }
      h1 { margin: 0 0 10px; font-size: 2rem; }
      h2 { margin-top: 28px; font-size: 1.2rem; }
      p, li { line-height: 1.6; color: var(--text); }
      .eyebrow {
        color: var(--accent);
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 12px;
      }
      .muted { color: var(--muted); }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
        margin: 24px 0;
      }
      .panel {
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 16px;
        background: #fbfdff;
      }
      .links {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        margin-top: 24px;
      }
      form {
        margin-top: 24px;
        padding: 20px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: #fbfdff;
      }
      label {
        display: block;
        font-weight: 600;
        margin-bottom: 8px;
      }
      input[type="text"],
      input[type="tel"] {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 12px 14px;
        font: inherit;
        margin-bottom: 16px;
      }
      .checkbox {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        font-weight: 400;
        margin-bottom: 18px;
      }
      .checkbox input {
        margin-top: 4px;
      }
      button {
        border: 0;
        border-radius: 999px;
        background: var(--accent);
        color: white;
        font: inherit;
        font-weight: 700;
        padding: 12px 18px;
        cursor: pointer;
      }
      a { color: var(--accent); }
      ul { padding-left: 20px; }
      .foot {
        margin-top: 28px;
        padding-top: 18px;
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-size: 0.95rem;
      }
      code {
        padding: 2px 6px;
        border-radius: 6px;
        background: #eef6fb;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        ${body}
      </div>
    </main>
  </body>
</html>`;
}

publicPagesRouter.get("/sms-consent", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const privacyUrl = `${baseUrl}/public/sms-privacy`;
  const termsUrl = `${baseUrl}/public/sms-terms`;
  const demoSubmitUrl = `${baseUrl}/public/sms-consent-demo`;

  res.type("html").send(
    renderPage(
      `${practiceName} SMS Consent`,
      `
        <div class="eyebrow">SMS Program Disclosure</div>
        <h1>${practiceName} Text Messaging Consent</h1>
        <p class="muted">
          Patients may opt in to receive text messages from ${practiceName} about appointments, billing,
          prescriptions, and care coordination. Consent is not a condition of treatment or purchase.
        </p>

        <div class="grid">
          <div class="panel">
            <strong>How patients opt in</strong>
            <p>Patients opt in by checking the SMS consent box during intake, portal registration, or staff-assisted registration, or by texting <code>START</code> to the practice messaging number.</p>
          </div>
          <div class="panel">
            <strong>Message types</strong>
            <p>Appointment reminders, scheduling updates, billing notices, prescription coordination, and care follow-up messages.</p>
          </div>
          <div class="panel">
            <strong>Frequency and fees</strong>
            <p>Message frequency varies by patient activity. Message and data rates may apply.</p>
          </div>
          <div class="panel">
            <strong>Help and opt-out</strong>
            <p>Reply <code>HELP</code> for help and <code>STOP</code> to opt out at any time. Support: ${supportPhone}.</p>
          </div>
        </div>

        <h2>Consent language used in the product</h2>
        <p>
          By opting in, the patient agrees to receive SMS messages from ${practiceName} related to appointments,
          billing, prescriptions, and care updates. Message frequency varies. Msg&amp;data rates may apply.
          Reply HELP for help and STOP to opt out.
        </p>

        <h2>Public opt-in form</h2>
        <p class="muted">
          This page displays the same SMS disclosure and checkbox language used during intake and portal registration.
        </p>
        <form method="POST" action="${demoSubmitUrl}">
          <label for="name">Patient name</label>
          <input id="name" name="name" type="text" autocomplete="name" />

          <label for="phone">Mobile phone number</label>
          <input id="phone" name="phone" type="tel" autocomplete="tel" />

          <label class="checkbox" for="sms-consent">
            <input id="sms-consent" name="smsConsent" type="checkbox" value="yes" required />
            <span>
              I agree to receive text messages from ${practiceName} about appointments, billing, prescriptions, and care updates.
              Message frequency varies. Message and data rates may apply. Reply HELP for help and STOP to opt out.
              Consent is not a condition of treatment. I agree to the <a href="${termsUrl}">Terms of Service</a> and
              <a href="${privacyUrl}">Privacy Policy</a>.
            </span>
          </label>

          <button type="submit">Submit SMS Consent</button>
        </form>

        <div class="links">
          <a href="${privacyUrl}">Privacy Policy</a>
          <a href="${termsUrl}">Terms of Service</a>
        </div>

        <div class="foot">
          Questions about the texting program can be directed to ${supportPhone} or ${supportEmail}.
        </div>
      `
    )
  );
});

publicPagesRouter.post("/sms-consent-demo", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  res.type("html").send(
    renderPage(
      `${practiceName} SMS Consent Submitted`,
      `
        <div class="eyebrow">SMS Program Disclosure</div>
        <h1>Consent Form Submitted</h1>
        <p class="muted">
          This public page is used to display the SMS consent call-to-action and required legal disclosures.
        </p>
        <p>
          The patient acknowledged the SMS consent disclosure for ${practiceName}, including message frequency,
          message and data rates, HELP support, STOP opt-out instructions, and the linked Terms of Service and Privacy Policy.
        </p>
        <div class="links">
          <a href="${baseUrl}/public/sms-consent">Back to SMS Consent</a>
          <a href="${baseUrl}/public/sms-privacy">Privacy Policy</a>
          <a href="${baseUrl}/public/sms-terms">Terms of Service</a>
        </div>
      `
    )
  );
});

publicPagesRouter.get("/sms-privacy", (_req, res) => {
  res.type("html").send(
    renderPage(
      `${practiceName} SMS Privacy Policy`,
      `
        <div class="eyebrow">Privacy Policy</div>
        <h1>${practiceName} SMS Privacy Policy</h1>
        <p class="muted">This policy explains how ${practiceName} handles mobile numbers and text-message related information.</p>

        <h2>Information collected</h2>
        <ul>
          <li>Mobile phone number provided by the patient or authorized representative.</li>
          <li>Consent status, opt-in date, opt-out date, and message delivery activity.</li>
          <li>Operational text content related to scheduling, billing, prescriptions, and care coordination.</li>
        </ul>

        <h2>How information is used</h2>
        <ul>
          <li>To send patient-authorized operational text messages.</li>
          <li>To maintain consent records and opt-out compliance.</li>
          <li>To support appointment management, billing communication, and patient care workflows.</li>
        </ul>

        <h2>Sharing</h2>
        <p>
          Mobile information will not be sold. It may be shared with service providers that enable message delivery,
          platform operations, and compliance obligations, subject to applicable privacy and healthcare requirements.
        </p>

        <h2>Patient choices</h2>
        <p>
          Patients may opt out at any time by replying <code>STOP</code>. Patients may request help by replying <code>HELP</code>
          or by contacting ${supportPhone}.
        </p>

        <h2>Contact</h2>
        <p>Questions can be sent to ${supportEmail} or directed to ${supportPhone}.</p>
      `
    )
  );
});

publicPagesRouter.get("/sms-terms", (_req, res) => {
  res.type("html").send(
    renderPage(
      `${practiceName} SMS Terms`,
      `
        <div class="eyebrow">Terms of Service</div>
        <h1>${practiceName} SMS Terms of Service</h1>
        <p class="muted">These terms apply to the practice's operational SMS program.</p>

        <h2>Program scope</h2>
        <p>
          The SMS program is used for non-promotional operational communications such as appointment reminders,
          scheduling updates, billing reminders, prescription coordination, and care follow-up.
        </p>

        <h2>Opt-in</h2>
        <p>
          Patients opt in through an intake form, portal registration flow, staff-assisted registration flow,
          or by texting <code>START</code> to the practice messaging number.
        </p>

        <h2>Opt-out</h2>
        <p>
          Patients may opt out at any time by replying <code>STOP</code>. After opting out, no further SMS messages
          will be sent unless the patient later replies <code>START</code> or provides new consent.
        </p>

        <h2>Help</h2>
        <p>Patients may reply <code>HELP</code> for assistance or contact ${supportPhone}.</p>

        <h2>Charges and availability</h2>
        <p>
          Message frequency varies. Message and data rates may apply. Wireless carrier delivery is not guaranteed and
          may be affected by carrier filtering, handset availability, or network conditions.
        </p>

        <h2>Healthcare limitations</h2>
        <p>
          Text messaging should not be used for medical emergencies. Patients with urgent medical concerns should call
          emergency services or contact the practice directly by phone.
        </p>
      `
    )
  );
});

export { publicPagesRouter };
