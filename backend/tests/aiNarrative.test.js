'use strict';

/**
 * SpendSmart Phase 7 — AI narrator unit tests (no API key needed).
 *
 * The Anthropic SDK client is replaced by a stub, so every AI outcome
 * — success, rate limit, timeout, malformed reply, invented amounts —
 * is exercised deterministically. Nothing here touches the network.
 *
 *   cd backend
 *   npm test
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.ANTHROPIC_API_KEY = '';

const { createAiNarrator, parseAiJson } = require('../src/services/aiNarrative');

function fakeCalculations(overrides = {}) {
  return {
    month: '2026-11',
    daysElapsed: 20,
    daysInMonth: 30,
    totals: { spent: 800, previousMonthSpent: 500, change: 60 },
    expenseCount: 6,
    averageExpense: 133.33,
    categories: [
      { category: 'Entertainment', amount: 500, percent: 62.5, previousAmount: 200, change: 150 },
      { category: 'Food', amount: 300, percent: 37.5, previousAmount: 300, change: 0 },
    ],
    biggestRiser: { category: 'Entertainment', amount: 500, previousAmount: 200, change: 150 },
    largestExpenses: [{ title: 'Movie night', amount: 500, category: 'Entertainment', date: '2026-11-06' }],
    budget: { set: true, amount: 2000, remaining: 1200, usagePercent: 40 },
    lowConfidence: false,
    insufficientData: false,
    ...overrides,
  };
}

function stubClient(reply) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text: typeof reply === 'string' ? reply : JSON.stringify(reply) }],
      }),
    },
  };

}

test('narrator: returns the AI narrative when the reply is valid JSON with real amounts', async () => {
  const narrator = createAiNarrator({
    apiKey: 'test-key',
    clientFactory: () =>
      stubClient({
        summary: 'You spent ₹800 this month — ₹500 of it on Entertainment, up 150% from last month.',
        suggestions: ['Set a weekly Entertainment cap of ₹150.', 'Cook at home twice a week.'],
        patterns: ['Entertainment is 62.5% of spending.'],
      }),
  });

  const result = await narrator.generateNarrative(fakeCalculations());
  assert.equal(result.ok, true);
  assert.equal(result.narrative.summary.includes('₹800'), true);
  assert.equal(result.narrative.suggestions.length, 2);
});

test('narrator: no API key short-circuits without calling the client', async () => {
  let called = false;
  const narrator = createAiNarrator({
    apiKey: null,
    clientFactory: () => {
      called = true;
      return stubClient({});
    },
  });

  const result = await narrator.generateNarrative(fakeCalculations());
  assert.deepEqual(result, { ok: false, reason: 'not-configured' });
  assert.equal(called, false);
});

test('narrator: reply mentioning an invented amount is rejected', async () => {
  const narrator = createAiNarrator({
    apiKey: 'test-key',
    clientFactory: () =>
      stubClient({
        summary: 'You spent ₹777 on snacks.',
        suggestions: ['Spend less.'],
        patterns: ['Snacks are high.'],
      }),
  });

  const result = await narrator.generateNarrative(fakeCalculations());
  assert.deepEqual(result, { ok: false, reason: 'invalid-response' });
});

test('narrator: non-JSON reply is rejected', async () => {
  const narrator = createAiNarrator({
    apiKey: 'test-key',
    clientFactory: () => stubClient('Here is your summary! You spent money this month.'),
  });

  const result = await narrator.generateNarrative(fakeCalculations());
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid-response');
});

test('narrator: reply with the wrong shape is rejected', async () => {
  const narrator = createAiNarrator({
    apiKey: 'test-key',
    clientFactory: () => stubClient({ summary: '', suggestions: 'not-an-array', patterns: [] }),
  });

  const result = await narrator.generateNarrative(fakeCalculations());
  assert.deepEqual(result, { ok: false, reason: 'invalid-response' });
});

test('narrator: rate limit maps to the rate-limited reason', async () => {
  const narrator = createAiNarrator({
    apiKey: 'test-key',
    clientFactory: () => ({
      messages: {
        create: async () => {
          const error = new Error('Too many requests');
          error.status = 429;
          throw error;
        },
      },
    }),
  });

  const result = await narrator.generateNarrative(fakeCalculations());
  assert.deepEqual(result, { ok: false, reason: 'rate-limited' });
});

test('narrator: timeout maps to the timeout reason', async () => {
  const narrator = createAiNarrator({
    apiKey: 'test-key',
    clientFactory: () => ({
      messages: {
        create: async () => {
          const error = new Error('Request timed out');
          error.name = 'APIConnectionTimeoutError';
          throw error;
        },
      },
    }),
  });

  const result = await narrator.generateNarrative(fakeCalculations());
  assert.deepEqual(result, { ok: false, reason: 'timeout' });
});

test('narrator: connection failure maps to unavailable', async () => {
  const narrator = createAiNarrator({
    apiKey: 'test-key',
    clientFactory: () => ({
      messages: {
        create: async () => {
          throw new Error('fetch failed');
        },
      },
    }),
  });

  const result = await narrator.generateNarrative(fakeCalculations());
  assert.deepEqual(result, { ok: false, reason: 'unavailable' });
});

test('narrator: markdown fences around the JSON are tolerated', async () => {
  const narrator = createAiNarrator({
    apiKey: 'test-key',
    clientFactory: () =>
      stubClient(
        '```json\n{"summary":"You spent ₹800.","suggestions":["Track daily."],"patterns":["Food is steady."]}\n```'
      ),
  });

  const result = await narrator.generateNarrative(fakeCalculations());
  assert.equal(result.ok, true);
  assert.equal(result.narrative.summary, 'You spent ₹800.');
});

test('parseAiJson: extracts the outermost object from mixed text', () => {
  assert.deepEqual(parseAiJson('prefix {"a":1} suffix'), { a: 1 });
  assert.equal(parseAiJson('no json here'), null);
});
