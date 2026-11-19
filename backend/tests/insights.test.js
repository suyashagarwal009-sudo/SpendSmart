'use strict';

/**
 * SpendSmart Phase 7 — deterministic insights tests.
 *
 * Covers computeInsights (pure calculations) and the POST /api/insights
 * endpoint with an in-memory store. The AI narrator is injected as a
 * stub, so no API key is needed: the fallback path, the AI path, and
 * the AI-unavailable path are all exercised explicitly.
 *
 *   cd backend
 *   npm test
 */

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Never let a real key from the environment or .env leak into these
// tests; dotenv does not override variables already set.
process.env.ANTHROPIC_API_KEY = '';

const { createApp } = require('../src/app');
const { createStore } = require('../src/services/store');
const {
  computeInsights,
  isValidMonthKey,
  previousMonthKey,
} = require('../src/services/insightsService');
const {
  buildFallbackNarrative,
  buildAiPayload,
  extractRupeeAmounts,
  validateNoInventedAmounts,
} = require('../src/services/aiNarrative');

function isoDay(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function expense(overrides = {}) {
  return {
    title: 'Test expense',
    amount: 100,
    category: 'Food',
    date: isoDay(2026, 11, 10),
    paymentMethod: 'UPI',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* computeInsights — pure calculations                                 */
/* ------------------------------------------------------------------ */

test('insights: totals, category percentages, and ranking are computed from real records', async () => {
  const store = createStore();
  await store.createExpense(expense({ title: 'Lunch', amount: 300, category: 'Food', date: isoDay(2026, 11, 2) }));
  await store.createExpense(expense({ title: 'Bus', amount: 100, category: 'Transport', date: isoDay(2026, 11, 5) }));
  await store.createExpense(expense({ title: 'Snacks', amount: 100, category: 'Food', date: isoDay(2026, 11, 8) }));

  const insights = await computeInsights(store, '2026-11');

  assert.equal(insights.totals.spent, 500);
  assert.equal(insights.expenseCount, 3);
  assert.equal(insights.averageExpense, 166.67);
  assert.equal(insights.categories.length, 2);
  assert.equal(insights.categories[0].category, 'Food');
  assert.equal(insights.categories[0].amount, 400);
  assert.equal(insights.categories[0].percent, 80);
  assert.equal(insights.categories[1].category, 'Transport');
  assert.equal(insights.categories[1].percent, 20);
});

test('insights: previous-month comparison and biggest riser', async () => {
  const store = createStore();
  await store.createExpense(expense({ amount: 200, category: 'Food', date: isoDay(2026, 10, 3) }));
  await store.createExpense(expense({ amount: 600, category: 'Food', date: isoDay(2026, 11, 3) }));
  await store.createExpense(expense({ amount: 100, category: 'Transport', date: isoDay(2026, 11, 4) }));

  const insights = await computeInsights(store, '2026-11');

  assert.equal(insights.previousMonth, '2026-10');
  assert.equal(insights.totals.previousMonthSpent, 200);
  assert.equal(insights.totals.change, 250);
  assert.equal(insights.biggestRiser.category, 'Food');
  assert.equal(insights.biggestRiser.previousAmount, 200);
  assert.equal(insights.biggestRiser.amount, 600);
});

test('insights: budget remaining and usage percent', async () => {
  const store = createStore();
  await store.setBudget('2026-11', 1000);
  await store.createExpense(expense({ amount: 250, category: 'Food', date: isoDay(2026, 11, 3) }));

  const insights = await computeInsights(store, '2026-11');

  assert.deepEqual(insights.budget, {
    set: true,
    amount: 1000,
    remaining: 750,
    usagePercent: 25,
  });
});

test('insights: unset budget reports set=false and null remaining', async () => {
  const store = createStore();
  await store.createExpense(expense({ date: isoDay(2026, 11, 3) }));

  const insights = await computeInsights(store, '2026-11');
  assert.equal(insights.budget.set, false);
  assert.equal(insights.budget.remaining, null);
});

test('insights: empty month is flagged insufficient, prior month with data is not', async () => {
  const store = createStore();
  await store.createExpense(expense({ date: isoDay(2026, 10, 3) }));

  const empty = await computeInsights(store, '2026-11');
  assert.equal(empty.insufficientData, true);
  assert.equal(empty.totals.spent, 0);

  const prior = await computeInsights(store, '2026-10');
  assert.equal(prior.insufficientData, false);
});

test('insights: month with a few expenses is flagged low-confidence', async () => {
  const store = createStore();
  for (let i = 1; i <= 3; i += 1) {
    await store.createExpense(expense({ amount: 50, date: isoDay(2026, 11, i) }));
  }
  const insights = await computeInsights(store, '2026-11');
  assert.equal(insights.lowConfidence, true);
});

test('insights: helper functions', () => {
  assert.equal(isValidMonthKey('2026-11'), true);
  assert.equal(isValidMonthKey('2026-13'), false);
  assert.equal(isValidMonthKey('november'), false);
  assert.equal(previousMonthKey('2026-01'), '2025-12');
  assert.equal(previousMonthKey('2026-11'), '2026-10');
});

/* ------------------------------------------------------------------ */
/* Fallback narrative and AI payload helpers                           */
/* ------------------------------------------------------------------ */

test('fallback: insufficient data produces a friendly message and no suggestions', async () => {
  const store = createStore();
  const insights = await computeInsights(store, '2026-11');
  const narrative = buildFallbackNarrative(insights);

  assert.equal(narrative.insufficientData, true);
  assert.match(narrative.summary, /No expenses were recorded/i);
  assert.deepEqual(narrative.suggestions, []);
});

test('fallback: populated month produces summary, suggestions, and patterns', async () => {
  const store = createStore();
  await store.setBudget('2026-11', 1000);
  await store.createExpense(expense({ title: 'Lunch', amount: 300, category: 'Food', date: isoDay(2026, 11, 2) }));
  const insights = await computeInsights(store, '2026-11');

  const narrative = buildFallbackNarrative(insights);
  assert.equal(narrative.insufficientData, false);
  assert.ok(narrative.summary.length > 40);
  assert.ok(narrative.suggestions.length >= 2);
  assert.ok(narrative.patterns.length >= 1);
  assert.match(narrative.summary, /Food/);
  assert.match(narrative.summary, /₹700/);
});

test('ai payload: contains aggregates only, never the raw expense list', async () => {
  const store = createStore();
  await store.setBudget('2026-11', 5000);
  await store.createExpense(expense({ title: 'Lunch', amount: 300, category: 'Food', date: isoDay(2026, 11, 2) }));
  const insights = await computeInsights(store, '2026-11');

  const payload = buildAiPayload(insights);
  const json = JSON.stringify(payload);
  assert.ok(!json.includes('"paymentMethod"'), 'raw expense fields must not be sent');
  assert.ok(!json.includes('"id"'), 'raw expense ids must not be sent');
  assert.equal(payload.topCategories.length, 1);
  assert.equal(payload.topCategories[0].category, 'Food');
  assert.equal(payload.budget.amount, 5000);
});

test('amount guard: AI text citing only real amounts passes, invented ones fail', () => {
  const payload = { totals: { spentSoFar: 300 }, topCategories: [{ category: 'Food', amount: 300 }] };

  assert.equal(
    validateNoInventedAmounts(
      { summary: 'You spent ₹300 on Food.', suggestions: [], patterns: [] },
      payload
    ),
    true
  );
  assert.equal(
    validateNoInventedAmounts(
      { summary: 'You spent ₹777 on Food.', suggestions: [], patterns: [] },
      payload
    ),
    false
  );
  assert.deepEqual(extractRupeeAmounts('₹1,200.50 and ₹99'), [1200.5, 99]);
});

/* ------------------------------------------------------------------ */
/* POST /api/insights endpoint (stub narrator)                         */
/* ------------------------------------------------------------------ */

let server;
let baseUrl;
let store;

async function api(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, body: json };
}

before(async () => {
  store = createStore();
  await store.setBudget('2026-11', 2000);
  await store.createExpense(expense({ title: 'Lunch', amount: 300, category: 'Food', date: isoDay(2026, 11, 2) }));
  await store.createExpense(expense({ title: 'Movie', amount: 500, category: 'Entertainment', date: isoDay(2026, 11, 6) }));
  const app = createApp({
    store,
    storageMode: 'temporary-in-memory',
    narrator: { generateNarrative: async () => ({ ok: false, reason: 'not-configured' }) },
    insightsRateLimitMs: 0,
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('endpoint: POST /api/insights returns verified calculations plus a labelled fallback narrative', async () => {
  const { status, body } = await api('POST', '/api/insights', { month: '2026-11' });

  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.calculations.totals.spent, 800);
  assert.equal(body.data.calculations.categories[0].category, 'Entertainment');
  assert.equal(body.data.calculations.budget.remaining, 1200);
  assert.equal(body.data.narrativeSource, 'fallback');
  assert.equal(body.data.aiStatus, 'not-configured');
  assert.ok(body.data.narrative.summary.length > 40);
});

test('endpoint: AI narrator result is returned as the narrative when it succeeds', async () => {
  const aiNarrative = {
    insufficientData: false,
    summary: 'You spent ₹800 this month, mostly on Entertainment (₹500).',
    suggestions: ['Set a weekly cap for Entertainment.'],
    patterns: ['Entertainment is 62.5% of your spending.'],
  };
  const app = createApp({
    store,
    storageMode: 'temporary-in-memory',
    narrator: { generateNarrative: async () => ({ ok: true, narrative: aiNarrative }) },
    insightsRateLimitMs: 0,
  });
  const aiServer = app.listen(0);
  await new Promise((resolve) => aiServer.once('listening', resolve));
  const aiBase = `http://127.0.0.1:${aiServer.address().port}`;

  const response = await fetch(`${aiBase}/api/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month: '2026-11' }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.narrativeSource, 'ai');
  assert.equal(body.data.aiStatus, 'ok');
  assert.equal(body.data.narrative.summary, aiNarrative.summary);
  await new Promise((resolve) => aiServer.close(resolve));
});

test('endpoint: current month is the default when no month is sent', async () => {
  const { status, body } = await api('POST', '/api/insights', {});
  assert.equal(status, 200);
  const now = new Date();
  const expected = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  assert.equal(body.data.month, expected);
});

test('endpoint: invalid month returns 400 with a field error', async () => {
  const { status, body } = await api('POST', '/api/insights', { month: 'November' });
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.ok(body.error.fields.month);
});

test('endpoint: empty month returns the friendly insufficient-data message', async () => {
  const { status, body } = await api('POST', '/api/insights', { month: '2026-09' });
  assert.equal(status, 200);
  assert.equal(body.data.calculations.insufficientData, true);
  assert.equal(body.data.narrative.insufficientData, true);
  assert.match(body.data.narrative.summary, /No expenses were recorded/i);
  assert.equal(body.data.aiStatus, 'skipped');
});

test('endpoint: AI failure still returns full calculations with fallback narrative', async () => {
  const app = createApp({
    store,
    storageMode: 'temporary-in-memory',
    narrator: { generateNarrative: async () => ({ ok: false, reason: 'timeout' }) },
    insightsRateLimitMs: 0,
  });
  const failServer = app.listen(0);
  await new Promise((resolve) => failServer.once('listening', resolve));
  const failBase = `http://127.0.0.1:${failServer.address().port}`;

  const response = await fetch(`${failBase}/api/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month: '2026-11' }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.calculations.totals.spent, 800);
  assert.equal(body.data.narrativeSource, 'fallback');
  assert.equal(body.data.aiStatus, 'timeout');
  assert.match(body.data.aiMessage, /timed out/);
  await new Promise((resolve) => failServer.close(resolve));
});

test('endpoint: rapid insights calls are rate-limited with 429', async () => {
  const app = createApp({
    store,
    storageMode: 'temporary-in-memory',
    narrator: { generateNarrative: async () => ({ ok: false, reason: 'not-configured' }) },
    // Default 10s window applies in this test.
  });
  const limitedServer = app.listen(0);
  await new Promise((resolve) => limitedServer.once('listening', resolve));
  const limitedBase = `http://127.0.0.1:${limitedServer.address().port}`;

  const first = await fetch(`${limitedBase}/api/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month: '2026-11' }),
  });
  assert.equal(first.status, 200);

  const second = await fetch(`${limitedBase}/api/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month: '2026-11' }),
  });
  const secondBody = await second.json();
  assert.equal(second.status, 429);
  assert.equal(secondBody.success, false);
  assert.match(secondBody.error.message, /Too many insight requests/);

  await new Promise((resolve) => limitedServer.close(resolve));
});
