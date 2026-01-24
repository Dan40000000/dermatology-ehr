const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', (msg) => console.log('console', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('pageerror', err));
  page.on('requestfailed', (req) => console.log('requestfailed', req.url(), req.failure()));
  page.on('response', async (resp) => {
    const url = resp.url();
    const contentType = resp.headers()['content-type'] || '';
    if ((url.includes('/src/') || url.includes('/node_modules/')) && contentType.includes('application/json')) {
      console.log('JSON module response', resp.status(), url, contentType);
      try {
        const text = await resp.text();
        console.log('JSON body preview', text.slice(0, 200));
      } catch (err) {
        console.log('JSON body read error', err);
      }
    }
  });

  const demoSession = {
    tenantId: 'tenant-demo',
    accessToken: 'playwright-token',
    refreshToken: 'playwright-refresh',
    user: {
      id: 'user-1',
      email: 'admin@demo.practice',
      fullName: 'Demo Admin',
      role: 'admin',
    },
  };

  const orders = [
    {
      id: 'order-path-1',
      patientId: 'patient-1',
      type: 'pathology',
      status: 'pending',
      details: 'Shave Biopsy',
      createdAt: new Date().toISOString(),
    },
  ];

  const patients = [
    { id: 'patient-1', firstName: 'Riley', lastName: 'Stone', insurance: { planName: 'Aetna Gold' } },
  ];

  const eligibilityHistory = {
    'patient-1': {
      verification_status: 'active',
      verified_at: new Date().toISOString(),
      has_issues: false,
    },
  };

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname === '/api/orders' && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ orders }) });
    }
    if (url.pathname === '/api/patients') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ patients }) });
    }
    if (url.pathname === '/api/providers') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [] }) });
    }
    if (url.pathname === '/api/eligibility/history/batch') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, history: eligibilityHistory }) });
    }
    if (url.pathname === '/api/messaging/unread-count') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  await page.addInitScript((session) => {
    localStorage.setItem('derm_session', JSON.stringify(session));
  }, demoSession);

  await page.goto('http://localhost:5174/labs');
  await page.waitForTimeout(4000);
  console.log('url', page.url());

  await browser.close();
})();
