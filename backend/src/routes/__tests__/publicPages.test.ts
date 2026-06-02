import request from 'supertest';
import express from 'express';
import { publicPagesRouter } from '../publicPages';

const app = express();
app.use('/public', publicPagesRouter);

describe('Public SMS compliance pages', () => {
  it('serves the SMS consent page with compliance language and links', async () => {
    const res = await request(app).get('/public/sms-consent').set('host', 'example.test');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Text Messaging Consent');
    expect(res.text).toContain('Reply <code>HELP</code> for help and <code>STOP</code> to opt out');
    expect(res.text).toContain('Submit SMS Consent');
    expect(res.text).toContain('/public/sms-opt-in-evidence');
    expect(res.text).toContain('/public/sms-privacy');
    expect(res.text).toContain('/public/sms-terms');
  });

  it('serves the SMS opt-in evidence page', async () => {
    const res = await request(app).get('/public/sms-opt-in-evidence').set('host', 'example.test');

    expect(res.status).toBe(200);
    expect(res.text).toContain('SMS Opt-In Flow Evidence');
    expect(res.text).toContain('Exact disclosure shown at consent');
    expect(res.text).toContain('Consent is optional');
    expect(res.text).toContain('/public/sms-consent');
    expect(res.text).toContain('/public/sms-privacy');
    expect(res.text).toContain('/public/sms-terms');
  });

  it('serves the SMS consent confirmation page', async () => {
    const res = await request(app)
      .post('/public/sms-consent-demo')
      .type('form')
      .send({ name: 'Dan Perry', phone: '5412318693', smsConsent: 'yes' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Consent Form Submitted');
    expect(res.text).toContain('/public/sms-consent');
  });

  it('serves the SMS privacy page', async () => {
    const res = await request(app).get('/public/sms-privacy');

    expect(res.status).toBe(200);
    expect(res.text).toContain('SMS Privacy Policy');
    expect(res.text).toContain('Mobile information will not be sold, rented, or shared with third parties');
    expect(res.text).toContain('for marketing or promotional purposes');
  });

  it('serves the SMS terms page', async () => {
    const res = await request(app).get('/public/sms-terms');

    expect(res.status).toBe(200);
    expect(res.text).toContain('SMS Terms of Service');
    expect(res.text).toContain('Patients may opt out at any time by replying');
    expect(res.text).toContain('Consent to receive text messages is not a condition of treatment or purchase');
  });
});
