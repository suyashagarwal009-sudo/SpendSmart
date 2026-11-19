'use strict';

/**
 * Submission audit — API edge-case battery against the live server.
 * Exercises invalid, missing, zero, negative, and boundary amounts;
 * nonexistent records; malformed JSON; unknown routes and methods.
 * Prints a compact PASS/FAIL report and exits nonzero on any failure.
 */

const BASE = 'http://localhost:5000';
let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(method, path, body, raw) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined && raw === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* raw text */
  }
  return { status: response.status, body: json, text };
}

function today(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

const valid = () => ({
  title: 'Audit expense',
  amount: 100,
  category: 'Food',
  date: today(),
  paymentMethod: 'UPI',
});

async function main() {
  // Clean slate
  const list = await (await call('GET', '/api/expenses')).body;
  for (const e of list.data || []) await call('DELETE', `/api/expenses/${e.id}`);

  // --- Invalid / missing / zero / negative amounts ---
  const cases = [
    ['missing amount', { ...valid(), amount: undefined }],
    ['zero amount', { ...valid(), amount: 0 }],
    ['negative amount', { ...valid(), amount: -50 }],
    ['string amount', { ...valid(), amount: 'abc' }],
    ['NaN-style amount', { ...valid(), amount: 'NaN' }],
    // (three-decimal amounts are ROUNDED to 2 places by the API, not rejected —
    // asserted separately below)
    ['above ceiling', { ...valid(), amount: 10000001 }],
    ['missing title', { ...valid(), title: '' }],
    ['one-char title', { ...valid(), title: 'x' }],
    ['missing category', { ...valid(), category: '' }],
    ['unknown category', { ...valid(), category: 'Crypto' }],
    ['missing payment method', { ...valid(), paymentMethod: '' }],
    ['unknown payment method', { ...valid(), paymentMethod: 'Barter' }],
    ['bad date format', { ...valid(), date: '20/11/2026' }],
    ['impossible date', { ...valid(), date: '2026-02-30' }],
    ['year too early', { ...valid(), date: '1999-12-31' }],
    ['empty body', {}],
  ];
  for (const [name, payload] of cases) {
    const { status, body } = await call('POST', '/api/expenses', payload);
    check(`POST rejects ${name} with 400`, status === 400 && body && body.success === false, `got ${status}`);
  }

  // Boundary: exactly 2 decimals is accepted; 1,00,00,000 accepted;
  // extra decimals are rounded half-up to 2 places.
  let r = await call('POST', '/api/expenses', { ...valid(), amount: 10.99 });
  check('POST accepts 2-decimal amount', r.status === 201, `got ${r.status}`);
  const okId = r.body.data.id;
  r = await call('POST', '/api/expenses', { ...valid(), amount: 10.999, title: 'Rounding' });
  check('POST rounds 3-decimal amount to 2 places', r.status === 201 && r.body.data.amount === 11, `got ${r.status} amount ${r.body.data && r.body.data.amount}`);
  const roundedId = r.body.data.id;
  r = await call('POST', '/api/expenses', { ...valid(), amount: 10000000, title: 'Ceiling' });
  check('POST accepts ceiling amount', r.status === 201, `got ${r.status}`);
  const ceilingId = r.body.data.id;

  // --- Nonexistent / malformed records ---
  r = await call('GET', '/api/expenses/does-not-exist');
  check('GET malformed id -> 404 (unknown record contract)', r.status === 404, `got ${r.status}`);
  r = await call('GET', `/api/expenses/${'a'.repeat(24)}`);
  check('GET well-formed unknown id -> 404', r.status === 404, `got ${r.status}`);
  r = await call('PUT', `/api/expenses/${'a'.repeat(24)}`, valid());
  check('PUT unknown id -> 404', r.status === 404, `got ${r.status}`);
  r = await call('DELETE', `/api/expenses/${'a'.repeat(24)}`);
  check('DELETE unknown id -> 404', r.status === 404, `got ${r.status}`);
  r = await call('PATCH', `/api/expenses/${okId}`, { amount: -5 });
  check('PATCH negative amount -> 400', r.status === 400, `got ${r.status}`);

  // --- Malformed JSON and unknown routes/methods ---
  r = await call('POST', '/api/expenses', undefined, '{not json');
  check('POST malformed JSON -> 400', r.status === 400, `got ${r.status}`);
  r = await call('GET', '/api/unknown');
  check('unknown route -> 404', r.status === 404, `got ${r.status}`);
  r = await call('DELETE', '/api/budget');
  check('DELETE on budget -> 404', r.status === 404, `got ${r.status}`);

  // --- Budget validation ---
  r = await call('PUT', '/api/budget', { amount: 0 });
  check('budget zero -> 400', r.status === 400, `got ${r.status}`);
  r = await call('PUT', '/api/budget', { amount: -100 });
  check('budget negative -> 400', r.status === 400, `got ${r.status}`);
  r = await call('PUT', '/api/budget', { amount: 'lots' });
  check('budget string -> 400', r.status === 400, `got ${r.status}`);
  r = await call('PUT', '/api/budget', { amount: 2500 });
  check('budget valid -> 200', r.status === 200 && r.body.data.budget === 2500, `got ${r.status}`);
  r = await call('GET', '/api/budget');
  check('budget persists after set', r.body.data.budget === 2500, JSON.stringify(r.body.data));

  // --- Calculations cross-check ---
  r = await call('GET', '/api/expenses');
  const total = r.body.data.reduce((sum, e) => sum + e.amount, 0);
  check('list returns exactly the created expenses', r.body.count === 3, `count ${r.body.count}`);
  check('manual total matches created amounts (with rounding)', total === 10000021.99, String(total));

  // --- Insights endpoint edge cases ---
  r = await call('POST', '/api/insights', { month: '2026-13' });
  check('insights invalid month -> 400', r.status === 400, `got ${r.status}`);
  r = await call('POST', '/api/insights', { month: '2020-05' });
  check('insights empty month -> friendly message', r.status === 200 && r.body.data.narrative.insufficientData === true);
  r = await call('POST', '/api/insights', {});
  check('insights default month -> 200 with fallback (no key)', r.status === 200 && r.body.data.narrativeSource === 'fallback', JSON.stringify(r.body.data && r.body.data.aiStatus));

  // --- CORS preflight ---
  const corsResponse = await fetch(`${BASE}/api/expenses`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' },
  });
  check('CORS allows the Vite origin', corsResponse.status === 204 || corsResponse.status === 200, `got ${corsResponse.status}`);
  const corsDenied = await fetch(`${BASE}/api/expenses`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://evil.example', 'Access-Control-Request-Method': 'POST' },
  });
  const allowHeader = corsDenied.headers.get('access-control-allow-origin');
  check('CORS rejects unknown origin', allowHeader !== 'http://evil.example', `allow-origin: ${allowHeader}`);

  // Cleanup
  await call('DELETE', `/api/expenses/${okId}`);
  await call('DELETE', `/api/expenses/${ceilingId}`);
  await call('DELETE', `/api/expenses/${roundedId}`);

  console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
