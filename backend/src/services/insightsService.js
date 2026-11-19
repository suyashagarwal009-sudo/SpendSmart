'use strict';

/**
 * Deterministic spending-insights calculations (Phase 7).
 *
 * Every number this module returns comes from application code over
 * real expense records — never from the AI service. The AI narrative
 * layer (aiNarrative.js) receives these results and may interpret
 * them, but it cannot change them.
 *
 * A "month key" is "YYYY-MM". Month bucketing uses the expense's ISO
 * date string directly (dates are stored as YYYY-MM-DD), so no
 * timezone conversion can shift an expense across months.
 */

const { roundMoney } = require('../../src/utils/format');

function monthKeyFromISODate(value) {
  return typeof value === 'string' ? value.slice(0, 7) : '';
}

function isValidMonthKey(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function previousMonthKey(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Day-of-month "today" for the given month key, in UTC. For past
 * months this is the full month; for the current month it is today's
 * date; for future months, day 0 (nothing has been spent yet).
 */
function daysElapsed(monthKey) {
  const now = new Date();
  const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  if (monthKey < currentKey) return daysInMonth(monthKey);
  if (monthKey > currentKey) return 0;
  return now.getUTCDate();
}

function percentChange(current, previous) {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return roundMoney(((current - previous) / previous) * 100);
}

/**
 * @param {object} store data store (listExpenses, getBudget)
 * @param {string} monthKey "YYYY-MM"
 * @returns {Promise<object>} verified calculations for the month
 */
async function computeInsights(store, monthKey) {
  if (!isValidMonthKey(monthKey)) {
    throw new Error(`Invalid month key "${monthKey}"`);
  }

  const allExpenses = await store.listExpenses();
  const prevKey = previousMonthKey(monthKey);

  const monthExpenses = allExpenses.filter(
    (expense) => monthKeyFromISODate(expense.date) === monthKey
  );
  const prevExpenses = allExpenses.filter(
    (expense) => monthKeyFromISODate(expense.date) === prevKey
  );

  const spent = roundMoney(monthExpenses.reduce((total, e) => total + e.amount, 0));
  const prevSpent = roundMoney(prevExpenses.reduce((total, e) => total + e.amount, 0));

  const totalsByCategory = new Map();
  monthExpenses.forEach((expense) => {
    totalsByCategory.set(
      expense.category,
      roundMoney((totalsByCategory.get(expense.category) ?? 0) + expense.amount)
    );
  });
  const prevTotalsByCategory = new Map();
  prevExpenses.forEach((expense) => {
    prevTotalsByCategory.set(
      expense.category,
      roundMoney((prevTotalsByCategory.get(expense.category) ?? 0) + expense.amount)
    );
  });

  const categories = [...totalsByCategory.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
      percent: spent > 0 ? roundMoney((amount / spent) * 100) : 0,
      previousAmount: prevTotalsByCategory.get(category) ?? 0,
      change: percentChange(amount, prevTotalsByCategory.get(category) ?? 0),
    }))
    .sort((a, b) => b.amount - a.amount);

  // Largest category that grew versus last month (needs a prior-month
  // total to compare against, so flat or new categories don't qualify).
  const biggestRiser =
    categories.find((c) => c.previousAmount > 0 && c.amount > c.previousAmount) ?? null;

  const budgetAmount = await store.getBudget(monthKey);
  const budgetSet = Number.isFinite(budgetAmount) && budgetAmount > 0;

  const largestExpenses = [...monthExpenses]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
    .map((expense) => ({
      title: expense.title,
      amount: expense.amount,
      category: expense.category,
      date: expense.date,
    }));

  return {
    month: monthKey,
    previousMonth: prevKey,
    daysElapsed: daysElapsed(monthKey),
    daysInMonth: daysInMonth(monthKey),
    totals: {
      spent,
      previousMonthSpent: prevSpent,
      change: percentChange(spent, prevSpent),
    },
    expenseCount: monthExpenses.length,
    averageExpense:
      monthExpenses.length > 0 ? roundMoney(spent / monthExpenses.length) : 0,
    categories,
    biggestRiser,
    largestExpenses,
    budget: {
      set: budgetSet,
      amount: budgetSet ? budgetAmount : 0,
      remaining: budgetSet ? roundMoney(budgetAmount - spent) : null,
      usagePercent: budgetSet && spent > 0 ? roundMoney((spent / budgetAmount) * 100) : 0,
    },
    // Friendly-message threshold: with nothing recorded there is
    // nothing useful to summarise or recommend.
    insufficientData: monthExpenses.length === 0,
    // With only a few expenses the picture is thin but not empty; the
    // narrative should say so rather than over-interpret.
    lowConfidence: monthExpenses.length > 0 && monthExpenses.length < 5,
  };
}

module.exports = {
  computeInsights,
  isValidMonthKey,
  previousMonthKey,
  daysInMonth,
  daysElapsed,
  percentChange,
};
