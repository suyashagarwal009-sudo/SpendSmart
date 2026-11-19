'use strict';

/**
 * SpendSmart API — automated endpoint tests.
 *
 * Runs the real Express app on an ephemeral port with its own in-memory
 * store (never the server's), then exercises every endpoint with fetch().
 * Node's built-in test runner is used, so there are no extra dependencies
 * beyond the ones the app already needs.
 *
 *   cd backend
 *   npm test
 */

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { createStore } = require('../src/services/store');

let server;
let baseUrl;
let store;

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isoDay(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function api(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    json = { raw: text };
  }
  return { status: response.status, body: json, headers: response.headers };
}

const validExpense = () => ({
  title: 'Canteen lunch',
  amount: 120,
  category: 'Food',
  date: isoDay(0),
  paymentMethod: 'UPI',
});

async function createSampleExpense(overrides = {}) {
  const result = await api('POST', '/api/expenses', { ...validExpense(), ...overrides });
  assert.equal(result.status, 201);
  return result.body.data;
}

before(async () => {
  store = createStore();
  const app = createApp({ store, storageMode: 'temporary-in-memory' });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

beforeEach(() => {
  store.reset();
});

after(() => {
  server.close();
});

/* ------------------------------------------------------------------ */
/* Health                                                             */
/* ------------------------------------------------------------------ */

test('GET /api/health reports the service and storage mode', async () => {
  const { status, body } = await api('GET', '/api/health');
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.status, 'ok');
  assert.equal(body.data.storage, 'temporary-in-memory');
  assert.equal(typeof body.data.timestamp, 'string');
});

/* ------------------------------------------------------------------ */
/* Expenses — read                                                      */
/* ------------------------------------------------------------------ */

test('GET /api/expenses returns an empty list initially', async () => {
  const { status, body } = await api('GET', '/api/expenses');
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.data, []);
  assert.equal(body.count, 0);
});

test('GET /api/expenses returns created expenses sorted newest-first', async () => {
  await createSampleExpense({ title: 'Older', date: isoDay(-5) });
  await createSampleExpense({ title: 'Newer', date: isoDay(-1) });

  const { status, body } = await api('GET', '/api/expenses');
  assert.equal(status, 200);
  assert.equal(body.count, 2);
  assert.equal(body.data[0].title, 'Newer');
  assert.equal(body.data[1].title, 'Older');
});

test('GET /api/expenses/:id returns a single expense', async () => {
  const created = await createSampleExpense();
  const { status, body } = await api('GET', `/api/expenses/${created.id}`);
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.id, created.id);
  assert.equal(body.data.title, 'Canteen lunch');
  assert.equal(body.data.amount, 120);
  assert.equal(body.data.paymentMethod, 'UPI');
  assert.equal(typeof body.data.createdAt, 'string');
  assert.equal(typeof body.data.updatedAt, 'string');
});

test('GET /api/expenses/:id returns 404 for a missing id', async () => {
  const { status, body } = await api('GET', '/api/expenses/00000000-0000-4000-8000-000000000000');
  assert.equal(status, 404);
  assert.equal(body.success, false);
  assert.match(body.error.message, /not found/i);
});

test('GET /api/expenses/:id rejects an obviously invalid id with 400', async () => {
  const { status, body } = await api('GET', '/api/expenses/not a valid id!!');
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.match(body.error.message, /Invalid expense id/i);
});

/* ------------------------------------------------------------------ */
/* Expenses — create                                                    */
/* ------------------------------------------------------------------ */

test('POST /api/expenses creates an expense with 201', async () => {
  const { status, body } = await api('POST', '/api/expenses', validExpense());
  assert.equal(status, 201);
  assert.equal(body.success, true);
  assert.equal(body.data.title, 'Canteen lunch');
  assert.equal(body.data.amount, 120);
  assert.equal(body.data.category, 'Food');
  assert.equal(body.data.date, isoDay(0));
  assert.equal(body.data.paymentMethod, 'UPI');
  assert.match(body.data.id, /^[0-9a-f-]{36}$/);

  const listed = await api('GET', '/api/expenses');
  assert.equal(listed.body.count, 1);
});

test('POST /api/expenses trims the title and rounds the amount', async () => {
  const { status, body } = await api('POST', '/api/expenses', {
    ...validExpense(),
    title: '   Bus ticket   ',
    amount: 19.999,
  });
  assert.equal(status, 201);
  assert.equal(body.data.title, 'Bus ticket');
  assert.equal(body.data.amount, 20);
});

test('POST /api/expenses rejects an empty body with per-field errors', async () => {
  const { status, body } = await api('POST', '/api/expenses', {});
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error.message, 'Invalid expense data');
  assert.ok(body.error.fields.title);
  assert.ok(body.error.fields.amount);
  assert.ok(body.error.fields.category);
  assert.ok(body.error.fields.date);
  assert.ok(body.error.fields.paymentMethod);
});

test('POST /api/expenses rejects blank and short titles', async () => {
  const blank = await api('POST', '/api/expenses', { ...validExpense(), title: '   ' });
  assert.equal(blank.status, 400);
  assert.match(blank.body.error.fields.title, /required/i);

  const short = await api('POST', '/api/expenses', { ...validExpense(), title: 'A' });
  assert.equal(short.status, 400);
  assert.match(short.body.error.fields.title, /at least 2 characters/i);

  const long = await api('POST', '/api/expenses', { ...validExpense(), title: 'x'.repeat(81) });
  assert.equal(long.status, 400);
  assert.match(long.body.error.fields.title, /at most 80 characters/i);
});

test('POST /api/expenses rejects zero, negative and non-numeric amounts', async () => {
  for (const amount of [0, -50]) {
    const { status, body } = await api('POST', '/api/expenses', { ...validExpense(), amount });
    assert.equal(status, 400, `amount ${amount}`);
    assert.match(body.error.fields.amount, /greater than zero/i);
  }

  const text = await api('POST', '/api/expenses', { ...validExpense(), amount: 'abc' });
  assert.equal(text.status, 400);
  assert.match(text.body.error.fields.amount, /must be a number/i);

  const missing = await api('POST', '/api/expenses', { ...validExpense(), amount: undefined });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error.fields.amount, /required/i);
});

test('POST /api/expenses rejects unknown categories and payment methods', async () => {
  const category = await api('POST', '/api/expenses', { ...validExpense(), category: 'Crypto' });
  assert.equal(category.status, 400);
  assert.match(category.body.error.fields.category, /Category must be one of/i);

  const payment = await api('POST', '/api/expenses', { ...validExpense(), paymentMethod: 'Bitcoin' });
  assert.equal(payment.status, 400);
  assert.match(payment.body.error.fields.paymentMethod, /Payment method must be one of/i);
});

test('POST /api/expenses rejects impossible and far-future dates', async () => {
  for (const date of ['2026-13-40', '2026-02-30', 'not-a-date', '']) {
    const { status, body } = await api('POST', '/api/expenses', { ...validExpense(), date });
    assert.equal(status, 400, `date ${date}`);
    assert.ok(body.error.fields.date, `date ${date} should be flagged`);
  }

  const farFuture = await api('POST', '/api/expenses', {
    ...validExpense(),
    date: isoDay(500),
  });
  assert.equal(farFuture.status, 400);
  assert.ok(farFuture.body.error.fields.date);
});

test('POST /api/expenses rejects malformed JSON with 400', async () => {
  const response = await fetch(`${baseUrl}/api/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"title": "Broken", ',
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.match(body.error.message, /not valid JSON/i);
});

test('POST /api/expenses rejects a non-object JSON body', async () => {
  const response = await fetch(`${baseUrl}/api/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(['not', 'an', 'object']),
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.success, false);
});

/* ------------------------------------------------------------------ */
/* Expenses — update                                                    */
/* ------------------------------------------------------------------ */

test('PUT /api/expenses/:id replaces all editable fields', async () => {
  const created = await createSampleExpense();
  const { status, body } = await api('PUT', `/api/expenses/${created.id}`, {
    title: 'Canteen dinner',
    amount: 250.5,
    category: 'Food',
    date: isoDay(-2),
    paymentMethod: 'Card',
  });

  assert.equal(status, 200);
  assert.equal(body.data.id, created.id);
  assert.equal(body.data.title, 'Canteen dinner');
  assert.equal(body.data.amount, 250.5);
  assert.equal(body.data.paymentMethod, 'Card');
  assert.equal(body.data.createdAt, created.createdAt);
  assert.notEqual(body.data.updatedAt, created.updatedAt);
});

test('PUT /api/expenses/:id requires every field', async () => {
  const created = await createSampleExpense();
  const { status, body } = await api('PUT', `/api/expenses/${created.id}`, {
    title: 'Only a title',
  });
  assert.equal(status, 400);
  assert.ok(body.error.fields.amount);
  assert.ok(body.error.fields.category);
  assert.ok(body.error.fields.date);
  assert.ok(body.error.fields.paymentMethod);
});

test('PUT /api/expenses/:id returns 404 for a missing id', async () => {
  const { status, body } = await api(
    'PUT',
    '/api/expenses/00000000-0000-4000-8000-000000000000',
    { ...validExpense() }
  );
  assert.equal(status, 404);
  assert.match(body.error.message, /not found/i);
});

test('PATCH /api/expenses/:id updates a subset of fields', async () => {
  const created = await createSampleExpense();
  const { status, body } = await api('PATCH', `/api/expenses/${created.id}`, {
    amount: 90,
  });
  assert.equal(status, 200);
  assert.equal(body.data.amount, 90);
  assert.equal(body.data.title, 'Canteen lunch');
  assert.equal(body.data.category, 'Food');
});

test('PATCH /api/expenses/:id rejects an empty update', async () => {
  const created = await createSampleExpense();
  const { status, body } = await api('PATCH', `/api/expenses/${created.id}`, {});
  assert.equal(status, 400);
  assert.match(body.error.fields.body, /at least one editable field/i);
});

/* ------------------------------------------------------------------ */
/* Expenses — delete                                                    */
/* ------------------------------------------------------------------ */

test('DELETE /api/expenses/:id removes the expense', async () => {
  const created = await createSampleExpense();
  const deleted = await api('DELETE', `/api/expenses/${created.id}`);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.success, true);
  assert.match(deleted.body.message, /deleted/i);

  const fetched = await api('GET', `/api/expenses/${created.id}`);
  assert.equal(fetched.status, 404);

  const listed = await api('GET', '/api/expenses');
  assert.equal(listed.body.count, 0);
});

test('DELETE /api/expenses/:id returns 404 the second time', async () => {
  const created = await createSampleExpense();
  await api('DELETE', `/api/expenses/${created.id}`);
  const again = await api('DELETE', `/api/expenses/${created.id}`);
  assert.equal(again.status, 404);
  assert.match(again.body.error.message, /not found/i);
});

/* ------------------------------------------------------------------ */
/* Budget                                                               */
/* ------------------------------------------------------------------ */

test('GET /api/budget reports no budget before one is set', async () => {
  const { status, body } = await api('GET', '/api/budget');
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.month, currentMonthKey());
  assert.equal(body.data.budget, null);
  assert.match(body.message, /No budget set/i);
});

test('PUT /api/budget saves a budget for the current month', async () => {
  const { status, body } = await api('PUT', '/api/budget', { amount: 5000 });
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.month, currentMonthKey());
  assert.equal(body.data.budget, 5000);

  const read = await api('GET', '/api/budget');
  assert.equal(read.body.data.budget, 5000);
});

test('PUT /api/budget accepts the "budget" key and updates the value', async () => {
  await api('PUT', '/api/budget', { budget: 3000 });
  const updated = await api('PUT', '/api/budget', { amount: 4500.75 });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.budget, 4500.75);

  const read = await api('GET', '/api/budget');
  assert.equal(read.body.data.budget, 4500.75);
});

test('PUT /api/budget rejects invalid amounts', async () => {
  for (const amount of [0, -100, 'abc', null, '']) {
    const { status, body } = await api('PUT', '/api/budget', { amount });
    assert.equal(status, 400, `amount ${JSON.stringify(amount)}`);
    assert.ok(body.error.fields.amount);
  }

  const empty = await api('PUT', '/api/budget', {});
  assert.equal(empty.status, 400);
  assert.match(empty.body.error.fields.amount, /required/i);
});

test('budget and expenses are independent', async () => {
  await api('PUT', '/api/budget', { amount: 1000 });
  await createSampleExpense({ amount: 200 });
  const budget = await api('GET', '/api/budget');
  const expenses = await api('GET', '/api/expenses');
  assert.equal(budget.body.data.budget, 1000);
  assert.equal(expenses.body.data[0].amount, 200);
});

/* ------------------------------------------------------------------ */
/* Routing & CORS                                                       */
/* ------------------------------------------------------------------ */

test('unknown routes return a consistent 404 JSON error', async () => {
  const { status, body } = await api('GET', '/api/does-not-exist');
  assert.equal(status, 404);
  assert.equal(body.success, false);
  assert.match(body.error.message, /not found/i);
});

test('wrong HTTP methods on a known path return 404, not a crash', async () => {
  const { status, body } = await api('DELETE', '/api/budget');
  assert.equal(status, 404);
  assert.equal(body.success, false);
});

test('CORS allows the configured frontend origin', async () => {
  const response = await fetch(`${baseUrl}/api/expenses`, {
    headers: { Origin: 'http://localhost:5500' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5500');
});

test('CORS preflight is answered for the configured origin', async () => {
  const response = await fetch(`${baseUrl}/api/expenses`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5500',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5500');
  assert.match(response.headers.get('access-control-allow-methods') || '', /POST/);
});

test('total and count stay consistent across a full CRUD cycle', async () => {
  const first = await createSampleExpense({ title: 'First', amount: 100 });
  const second = await createSampleExpense({ title: 'Second', amount: 200 });

  let listed = await api('GET', '/api/expenses');
  assert.equal(listed.body.count, 2);

  await api('PUT', `/api/expenses/${first.id}`, {
    title: 'First edited',
    amount: 150,
    category: 'Food',
    date: isoDay(-1),
    paymentMethod: 'Cash',
  });
  await api('DELETE', `/api/expenses/${second.id}`);

  listed = await api('GET', '/api/expenses');
  assert.equal(listed.body.count, 1);
  assert.equal(listed.body.data[0].title, 'First edited');
  assert.equal(listed.body.data[0].amount, 150);
});
