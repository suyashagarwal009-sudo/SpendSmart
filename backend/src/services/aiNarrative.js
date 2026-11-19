'use strict';

/**
 * AI narrative layer (Phase 7b).
 *
 * Turns the *verified* calculations from insightsService.js into a
 * plain-language summary, suggestions, and pattern notes. The AI
 * service only ever interprets pre-computed figures — it never
 * produces numbers itself, and anything it returns is validated
 * before it reaches the client:
 *
 *   - the reply must be JSON with the expected shape;
 *   - every ₹ amount it mentions must exist in the input payload
 *     (the "no invented figures" guard);
 *   - timeouts, rate limits, and service errors degrade to a
 *     deterministic fallback narrative instead of failing the request.
 *
 * When no API key is configured the fallback is used directly — the
 * integration is real, but no live AI request is pretended.
 */

const { roundMoney } = require('../utils/format');

const DEFAULT_MODEL = 'claude-sonnet-5-5';
const REQUEST_TIMEOUT_MS = 30000;
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = [
  'You are the insights assistant for SpendSmart, a student expense tracker.',
  'You are given VERIFIED spending figures computed by the app from real expense records.',
  'Rules:',
  '1. Never invent expenses, amounts, categories, or percentages. Use only the figures provided.',
  '2. Do not claim that following suggestions guarantees savings.',
  '3. Write in simple, friendly language for a college student. All amounts are in Indian Rupees — write them with the ₹ symbol (e.g. ₹800), never with $ or plain numbers.',
  '4. Respond with JSON only, no markdown fences, exactly:',
  '   {"summary": string, "suggestions": string[], "patterns": string[]}',
  '5. "summary": 2-4 sentences on where the money went this month.',
  '6. "suggestions": 2-4 concrete, realistic ways to stay within budget. When a daily spending cap would help, cite budget.suggestedDailyAllowance — it is pre-computed from the verified figures.',
  '7. "patterns": 1-3 short notes explaining spending patterns (e.g. biggest category, change vs last month).',
  '8. If the data is too thin for useful recommendations, say so plainly in "summary" and keep the other arrays short.',
].join('\n');

/**
 * Compact payload for the AI: aggregates only, never the raw expense
 * list. `largestExpenses` (top 3 by amount) is included so the
 * narrative can cite real purchases; nothing else is personal data.
 */
function buildAiPayload(calculations) {
  return {
    month: calculations.month,
    daysElapsed: calculations.daysElapsed,
    daysInMonth: calculations.daysInMonth,
    totals: {
      spentSoFar: calculations.totals.spent,
      previousMonthSpent: calculations.totals.previousMonthSpent,
      changePercent: calculations.totals.change,
    },
    expenseCount: calculations.expenseCount,
    averageExpense: calculations.averageExpense,
    topCategories: calculations.categories.slice(0, 3).map((category) => ({
      category: category.category,
      amount: category.amount,
      percentOfMonth: category.percent,
      previousMonthAmount: category.previousAmount,
      changePercent: category.change,
    })),
    biggestRiser: calculations.biggestRiser
      ? {
          category: calculations.biggestRiser.category,
          current: calculations.biggestRiser.amount,
          previous: calculations.biggestRiser.previousAmount,
          changePercent: calculations.biggestRiser.change,
        }
      : null,
    largestExpenses: calculations.largestExpenses,
    budget: calculations.budget.set
      ? {
          amount: calculations.budget.amount,
          remaining: calculations.budget.remaining,
          usagePercent: calculations.budget.usagePercent,
          daysRemaining: Math.max(1, calculations.daysInMonth - calculations.daysElapsed + 1),
          suggestedDailyAllowance: roundMoney(
            calculations.budget.remaining /
              Math.max(1, calculations.daysInMonth - calculations.daysElapsed + 1)
          ),
        }
      : null,
    lowConfidence: calculations.lowConfidence,
  };
}

/** All ₹- or $-prefixed amounts in a piece of text, normalised to numbers. */
function extractRupeeAmounts(text) {
  const amounts = [];
  const pattern = /[₹$]\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    amounts.push(Number(match[1].replace(/,/g, '')));
  }
  return amounts;
}

function collectPayloadAmounts(payload, into) {
  if (typeof payload === 'number') {
    if (Number.isFinite(payload)) into.add(roundMoney(payload));
    return;
  }
  if (Array.isArray(payload)) {
    payload.forEach((item) => collectPayloadAmounts(item, into));
    return;
  }
  if (payload && typeof payload === 'object') {
    Object.values(payload).forEach((value) => collectPayloadAmounts(value, into));
  }
}

/**
 * Rejects the AI reply if it mentions a ₹ amount that does not exist
 * in the payload. Small rounding differences (up to ₹1) are tolerated.
 */
function validateNoInventedAmounts(narrative, payload) {
  const allowed = new Set();
  collectPayloadAmounts(payload, allowed);
  const text = [narrative.summary, ...narrative.suggestions, ...narrative.patterns].join('\n');
  return extractRupeeAmounts(text).every((amount) => {
    for (const candidate of allowed) {
      if (Math.abs(candidate - amount) <= 1) return true;
    }
    return false;
  });
}

function parseAiJson(text) {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function isValidNarrativeShape(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.summary === 'string' &&
    value.summary.trim().length > 0 &&
    Array.isArray(value.suggestions) &&
    value.suggestions.every((item) => typeof item === 'string' && item.trim().length > 0) &&
    Array.isArray(value.patterns) &&
    value.patterns.every((item) => typeof item === 'string' && item.trim().length > 0)
  );
}

/**
 * Deterministic narrative used when the AI is unavailable, not
 * configured, or returns something unusable. Same shape as the AI
 * reply so the frontend treats both identically apart from a
 * source label.
 */
function buildFallbackNarrative(calculations) {
  const formatINR = (value) =>
    `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  if (calculations.insufficientData) {
    return {
      insufficientData: true,
      summary:
        `No expenses were recorded in ${calculations.month} yet, so there is nothing to ` +
        'analyse. Add a few expenses and generate insights again — even a week of tracking ' +
        'is enough for a useful picture.',
      suggestions: [],
      patterns: [],
    };
  }

  const summaryParts = [];
  summaryParts.push(
    `You recorded ${calculations.expenseCount} ${calculations.expenseCount === 1 ? 'expense' : 'expenses'} ` +
      `totalling ${formatINR(calculations.totals.spent)} in ${calculations.month}.`
  );
  if (calculations.categories.length > 0) {
    const top = calculations.categories[0];
    summaryParts.push(
      `${top.category} was your largest category at ${formatINR(top.amount)} ` +
        `(${top.percent}% of spending).`
    );
  }
  if (calculations.totals.change !== null && calculations.totals.previousMonthSpent > 0) {
    const direction = calculations.totals.change > 0 ? 'up' : 'down';
    summaryParts.push(
      `That is ${direction} ${Math.abs(calculations.totals.change)}% from ` +
        `${formatINR(calculations.totals.previousMonthSpent)} last month.`
    );
  }
  if (calculations.budget.set) {
    const remaining = calculations.budget.remaining;
    summaryParts.push(
      remaining >= 0
        ? `You have ${formatINR(remaining)} left of your ${formatINR(calculations.budget.amount)} budget.`
        : `You are ${formatINR(Math.abs(remaining))} over your ${formatINR(calculations.budget.amount)} budget.`
    );
  }
  if (calculations.lowConfidence) {
    summaryParts.push(
      'Only a few expenses are recorded this month, so treat this as an early picture rather than a final one.'
    );
  }

  const suggestions = [];
  if (calculations.budget.set && calculations.budget.remaining < 0) {
    suggestions.push(
      'You are over budget for this month — pause non-essential spending until the month ends, then set next month\'s budget with this month\'s total in mind.'
    );
  } else if (calculations.budget.set) {
    suggestions.push(
      `Aim to keep daily spending under about ${formatINR(calculations.budget.remaining / Math.max(1, calculations.daysInMonth - calculations.daysElapsed + 1))} for the rest of the month to stay within budget.`
    );
  } else {
    suggestions.push(
      'No budget is set yet — add one on the Budget page so the app can flag when you are close to overspending.'
    );
  }
  if (calculations.categories.length > 0) {
    suggestions.push(
      `${calculations.categories[0].category} is your biggest category; setting a rough weekly cap for it is the fastest way to reduce total spending.`
    );
  }
  suggestions.push('Review your expenses once a week; small regular purchases are easy to miss and add up quickly.');

  const patterns = [];
  calculations.categories.slice(0, 2).forEach((category) => {
    patterns.push(
      `${category.category}: ${formatINR(category.amount)} (${category.percent}% of the month's spending).`
    );
  });
  if (calculations.biggestRiser) {
    patterns.push(
      `${calculations.biggestRiser.category} grew from ${formatINR(calculations.biggestRiser.previousAmount)} ` +
        `to ${formatINR(calculations.biggestRiser.amount)} compared with last month.`
    );
  }
  if (calculations.totals.change !== null && calculations.totals.previousMonthSpent > 0) {
    patterns.push(
      `Total spending is ${calculations.totals.change >= 0 ? 'higher' : 'lower'} than last month by ` +
        `${Math.abs(calculations.totals.change)}%.`
    );
  }

  return {
    insufficientData: false,
    summary: summaryParts.join(' '),
    suggestions: suggestions.slice(0, 4),
    patterns,
  };
}

function classifyAiError(error) {
  if (error && error.status === 429) return 'rate-limited';
  if (error && (error.name === 'APIConnectionTimeoutError' || error.code === 'ETIMEDOUT')) {
    return 'timeout';
  }
  return 'unavailable';
}

/**
 * Creates the narrator. `clientFactory` is injectable for tests; by
 * default a real Anthropic SDK client is built when a key is present.
 */
function createAiNarrator({ apiKey, model = DEFAULT_MODEL, clientFactory } = {}) {
  let client = null;

  function getClient() {
    if (client) return client;
    if (typeof clientFactory === 'function') {
      client = clientFactory();
      return client;
    }
    // Lazy require so the SDK is not loaded (or needed) when no key exists.
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic({
      apiKey,
      timeout: REQUEST_TIMEOUT_MS,
      max_retries: 1,
    });
    return client;
  }

  return {
    /**
     * @returns {Promise<{ok: true, narrative: object}|{ok: false, reason: string}>}
     */
    async generateNarrative(calculations) {
      if (!apiKey) {
        return { ok: false, reason: 'not-configured' };
      }

      const payload = buildAiPayload(calculations);
      let response;
      try {
        response = await getClient().messages.create({
          model,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content:
                'Here are the verified spending figures as JSON:\n' +
                `${JSON.stringify(payload)}\n\n` +
                'Produce the insights JSON now.',
            },
          ],
        });
      } catch (error) {
        return { ok: false, reason: classifyAiError(error) };
      }

      const text = (response.content || [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();

      const parsed = parseAiJson(text);
      if (!isValidNarrativeShape(parsed)) {
        return { ok: false, reason: 'invalid-response' };
      }

      const narrative = {
        insufficientData: false,
        summary: parsed.summary.trim(),
        suggestions: parsed.suggestions.map((item) => item.trim()).slice(0, 4),
        patterns: parsed.patterns.map((item) => item.trim()).slice(0, 3),
      };

      if (!validateNoInventedAmounts(narrative, payload)) {
        return { ok: false, reason: 'invalid-response' };
      }

      return { ok: true, narrative };
    },
  };
}

module.exports = {
  createAiNarrator,
  buildFallbackNarrative,
  buildAiPayload,
  extractRupeeAmounts,
  validateNoInventedAmounts,
  parseAiJson,
  isValidNarrativeShape,
  DEFAULT_MODEL,
};
