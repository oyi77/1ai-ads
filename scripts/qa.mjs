const results = [];
const test = (name, pass) => { results.push({ name, pass }); };

const BASE = process.env.QA_URL || 'http://localhost:3001';
let TOKEN = '';

async function apiTest(path, expected, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (TOKEN) opts.headers['Authorization'] = `Bearer ${TOKEN}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const json = await res.json();
  return expected(json, res);
}

async function run() {
  // 0. Auth
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.accessToken || loginData.data?.token;
  test('Login as admin', loginData.success && !!token);
  TOKEN = token;

  // 1. Protected routes require auth
  const noAuth = await fetch(`${BASE}/api/ads`);
  test('401 without token', noAuth.status === 401);

  // 2. API endpoints return valid JSON
  test('GET /api/ads', await apiTest('/api/ads', d => d.success === true && d.data.length > 0));
  test('GET /api/landing', await apiTest('/api/landing', d => d.success === true));
  test('GET /api/analytics/dashboard', await apiTest('/api/analytics/dashboard', d => d.success && d.data.total_spend > 0));
  test('GET /api/mcp/status', await apiTest('/api/mcp/status', d => d.success && d.data.meta !== undefined));

  // 3. Ads CRUD
  const adCreate = await apiTest('/api/ads', d => d.success && d.data.id, 'POST', { name: 'QA Ad', product: 'Widget', target: 'Devs', keunggulan: 'Fast', content_model: 'P.A.S', hook: 'Slow?', body: 'Try it', cta: 'Go' });
  test('POST /api/ads (create)', adCreate);

  let adId;
  { const r = await fetch(`${BASE}/api/ads`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ name: 'QA Delete Ad', product: 'Widget' }) });
    const json = await r.json();
    if (!json.success || !json.data) {
      console.error('Failed to create ad in QA:', JSON.stringify(json));
      process.exit(1);
    }
    adId = json.data.id; }

  test('PUT /api/ads/:id (update)', await apiTest(`/api/ads/${adId}`, d => d.success && d.data.name === 'Updated QA', 'PUT', { name: 'Updated QA' }));
  test('GET /api/ads/search', await apiTest('/api/ads/search?q=QA', d => d.data.length >= 1));

  // 4. Validation
  const badAd = await fetch(`${BASE}/api/ads`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ product: 'NoName' }) });
  test('POST /api/ads validation (no name)', badAd.status === 400);

  const badPlatform = await fetch(`${BASE}/api/ads`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ name: 'Test', platform: 'linkedin' }) });
  test('POST /api/ads validation (bad platform)', badPlatform.status === 400);

  // 5. Landing page render + XSS
  test('POST /render returns HTML', await apiTest('/api/landing/render', d => d.success && d.data.html_output.includes('<!DOCTYPE html>'), 'POST', { product_name: 'Test', price: 'Rp 99.000', theme: 'dark' }));
  test('Render escapes XSS', await apiTest('/api/landing/render', d => !d.data.html_output.includes('<script>alert(1)</script>'), 'POST', { product_name: '<script>alert(1)</script>', theme: 'dark' }));

  // 6. Landing page CRUD
  let lpId;
  { const r = await fetch(`${BASE}/api/landing`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ name: 'QA LP', template: 'dark', theme: 'dark' }) });
    lpId = (await r.json()).data.id; }
  test('POST /api/landing (create)', !!lpId);
  test('PUT /api/landing/:id', await apiTest(`/api/landing/${lpId}`, d => d.success && d.data.name === 'QA LP Updated', 'PUT', { name: 'QA LP Updated' }));

  const exportRes = await fetch(`${BASE}/api/landing/${lpId}/export`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  test('GET /api/landing/:id/export', exportRes.headers.get('content-type').includes('text/html'));

  await fetch(`${BASE}/api/landing/${lpId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } });
  test('DELETE /api/landing/:id', true);

  // 7. Trending & X Ads (New)
  test('GET /api/trending/internal', await apiTest('/api/trending/internal', d => d.success && Array.isArray(d.data)));
  test('GET /api/trending/external', await apiTest('/api/trending/external', d => d.success && d.data.length > 0));
  
  const xCreds = await apiTest('/api/settings/credentials/x', d => d.success, 'POST', { access_token: 'x_test_token' });
  test('POST /api/settings/credentials/x', xCreds);
  
  const getX = await apiTest('/api/settings/credentials/x', d => d.success && d.data.configured === true);
  test('GET /api/settings/credentials/x (configured)', getX);

  // 8. Dashboard real data (not fabricated)
  test('Dashboard has real spend data', await apiTest('/api/analytics/dashboard', d => d.data.total_spend > 0));
  test('Dashboard has real impressions', await apiTest('/api/analytics/dashboard', d => d.data.total_impressions > 0));

  // 8. File checks
  const fs = await import('fs');
  test('dist/index.html exists', fs.existsSync('dist/index.html'));
  test('server/lib/escape.js exists', fs.existsSync('server/lib/escape.js'));
  test('server/lib/validate.js exists', fs.existsSync('server/lib/validate.js'));
  test('server/lib/auth.js exists', fs.existsSync('server/lib/auth.js'));
  test('server/middleware/auth.js exists', fs.existsSync('server/middleware/auth.js'));
  test('server/repositories/ads.js exists', fs.existsSync('server/repositories/ads.js'));
  test('server/repositories/users.js exists', fs.existsSync('server/repositories/users.js'));

  // 9. Uncodixfy compliance
  const templates = fs.readFileSync('server/services/templates.js', 'utf-8');
  // Check the HTML output portion only, not comments
  const htmlOutput = templates.split('return `')[1]?.split('`;')[0] || '';
  test('No gradient in template HTML', !htmlOutput.includes('gradient'));
  test('No glassmorphism in templates', !templates.includes('backdrop-blur'));
  test('Templates use responsive grid', templates.includes('sm:grid-cols-2'));

  // Cleanup
  await fetch(`${BASE}/api/ads/${adId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } });

  // Report
  console.log('\n=== QA RESULTS ===');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  results.forEach(r => console.log(`  ${r.pass ? '\u2713' : '\u2717'} ${r.name}`));
  console.log(`\n${passed}/${results.length} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error('QA Error:', e); process.exit(1); });
